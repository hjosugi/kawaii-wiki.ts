/**
 * Markdown rendering pipeline — isomorphic (runs in Bun on the server for
 * render-on-save, and in the browser for the live editor preview).
 *
 * Ported in spirit from Wiki.js's `ux/src/renderers/markdown.js`, but as a
 * single pure function returning both the HTML and a structured table of
 * contents, instead of mutating shared renderer state.
 */
import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import hljs from 'highlight.js'
import { slugifyHeading } from './slug.ts'

export interface TocEntry {
  readonly id: string
  readonly text: string
  readonly level: number
}

export interface RenderResult {
  readonly html: string
  readonly toc: TocEntry[]
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const md: MarkdownIt = new MarkdownIt({
  html: false, // never trust raw HTML in wiki content
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, lang): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`
      } catch {
        /* fall through to escaped output */
      }
    }
    return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`
  },
}).use(anchor, {
  slugify: slugifyHeading,
  level: [1, 2, 3],
  tabIndex: false,
})

const headingLevel = (tag: string): number => Number.parseInt(tag.slice(1), 10) || 0

/**
 * Render Markdown to sanitized HTML and extract a 3-level table of contents in
 * a single parse pass.
 */
export const renderMarkdown = (content: string): RenderResult => {
  const env: Record<string, unknown> = {}
  const tokens = md.parse(content ?? '', env)
  const toc: TocEntry[] = []

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]
    if (open && open.type === 'heading_open') {
      const level = headingLevel(open.tag)
      if (level >= 1 && level <= 3) {
        const inline = tokens[i + 1]
        toc.push({
          id: open.attrGet('id') ?? '',
          text: inline?.content ?? '',
          level,
        })
      }
    }
  }

  const html = md.renderer.render(tokens, md.options, env)
  return { html, toc }
}

/** Strip Markdown/HTML to plain text — used for search indexing & descriptions. */
export const toPlainText = (content: string): string =>
  renderMarkdown(content)
    .html.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Build a short plain-text summary (auto-description when none is provided). */
export const summarize = (content: string, maxLength = 200): string => {
  const text = toPlainText(content)
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…'
}
