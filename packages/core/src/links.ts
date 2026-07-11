/** Wiki-link parsing plus internal-link extraction and move rewriting. */
import MarkdownIt from 'markdown-it'
import { slugifyHeading } from './slug.ts'

export interface PageLink {
  readonly path: string
  readonly label: string
  readonly kind: 'wikilink' | 'markdown'
}
const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

const wikiLinkPath = (rawPath: string): string =>
  rawPath
    .trim()
    .split('/')
    .map((segment) => slugifyHeading(segment))
    .filter(Boolean)
    .join('/')

export const installWikiLinkRule = (renderer: MarkdownIt): void => {
  renderer.inline.ruler.before('emphasis', 'wikilink', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b || state.src.charCodeAt(state.pos + 1) !== 0x5b) {
      return false
    }
    const end = state.src.indexOf(']]', state.pos + 2)
    if (end === -1) return false
    const raw = state.src.slice(state.pos + 2, end)
    const [rawPath = '', rawLabel = ''] = raw.split('|')
    const path = wikiLinkPath(rawPath)
    if (!path) return false

    if (!silent) {
      const open = state.push('link_open', 'a', 1)
      open.attrs = [
        ['href', `/${path}`],
        ['data-wiki-link', path],
      ]
      const text = state.push('text', '', 0)
      text.content = rawLabel.trim() || rawPath.trim()
      state.push('link_close', 'a', -1)
    }
    state.pos = end + 2
    return true
  })
}

interface LinkToken {
  readonly type: string
  readonly content: string
  readonly children?: LinkToken[] | null
  attrGet(name: string): string | null
}

const isExternalHref = (href: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')

const hrefToPagePath = (href: string): string | null => {
  const clean = href.trim().split('#')[0]?.split('?')[0] ?? ''
  if (!clean || isExternalHref(clean)) return null
  const path = clean.startsWith('/') ? clean.slice(1) : clean.replace(/^\.\//, '')
  if (!path || path.startsWith('_') || path.startsWith('assets/')) return null
  return path
}

const normalizeMarkdownLinkPath = (path: string): string =>
  path
    .split('/')
    .map((segment) => slugifyHeading(segment))
    .filter(Boolean)
    .join('/')

const addUniqueLink = (links: PageLink[], seen: Set<string>, link: PageLink): void => {
  if (!link.path || seen.has(`${link.kind}:${link.path}`)) return
  seen.add(`${link.kind}:${link.path}`)
  links.push(link)
}

export const extractPageLinksWith = (renderer: MarkdownIt, content: string): PageLink[] => {
  const links: PageLink[] = []
  const seen = new Set<string>()

  for (const match of (content ?? '').matchAll(WIKI_LINK)) {
    const rawPath = match[1]?.trim() ?? ''
    const label = (match[2]?.trim() || rawPath).trim()
    const path = wikiLinkPath(rawPath)
    addUniqueLink(links, seen, { path, label, kind: 'wikilink' })
  }

  const tokens = renderer.parse(content ?? '', {})
  const visit = (items: readonly LinkToken[]): void => {
    for (const token of items) {
      if (token.type === 'link_open') {
        if (token.attrGet('data-wiki-link')) continue
        const href = token.attrGet('href')
        const path = href ? hrefToPagePath(href) : null
        if (path) {
          const normalized = normalizeMarkdownLinkPath(path)
          addUniqueLink(links, seen, { path: normalized, label: path, kind: 'markdown' })
        }
      }
      if (token.children?.length) visit(token.children)
    }
  }
  visit(tokens as LinkToken[])

  return links
}

const MARKDOWN_LINK = /(!?)\[([^\]\n]+)\]\(([^)\s]+)\)/g

const splitHrefSuffix = (href: string): { base: string; suffix: string } => {
  const hashIndex = href.indexOf('#')
  const queryIndex = href.indexOf('?')
  const suffixIndex = [hashIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  return suffixIndex === undefined
    ? { base: href, suffix: '' }
    : { base: href.slice(0, suffixIndex), suffix: href.slice(suffixIndex) }
}

/** Rewrite internal page links after a page move, preserving link labels and anchors. */
export const rewritePageLinks = (content: string, fromPath: string, toPath: string): string => {
  const from = wikiLinkPath(fromPath)
  const to = wikiLinkPath(toPath)
  if (!from || !to || from === to) return content

  const withWikiLinks = (content ?? '').replace(WIKI_LINK, (match, rawPath: string, rawLabel?: string) => {
    if (wikiLinkPath(rawPath) !== from) return match
    const label = rawLabel === undefined ? '' : `|${rawLabel}`
    return `[[${to}${label}]]`
  })

  return withWikiLinks.replace(MARKDOWN_LINK, (match, bang: string, label: string, href: string) => {
    if (bang) return match
    const pagePath = hrefToPagePath(href)
    if (!pagePath || normalizeMarkdownLinkPath(pagePath) !== from) return match
    const { base, suffix } = splitHrefSuffix(href)
    const prefix = base.startsWith('/') ? '/' : ''
    return `[${label}](${prefix}${to}${suffix})`
  })
}
