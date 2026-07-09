/**
 * Markdown-file (de)serialization for the Git storage backend — pure & testable.
 *
 * A page becomes a `<path>.md` file with minimal YAML frontmatter:
 *
 *   ---
 *   title: Getting Started
 *   description: A short summary
 *   ---
 *
 *   # Getting Started
 *   ...body...
 *
 * We hand-roll a tiny frontmatter reader/writer so the core stays dependency-free;
 * it's lenient enough for hand-edited files.
 */
import { normalizePath } from './slug.ts'

export interface PageFileData {
  readonly title: string
  readonly description: string
  readonly icon?: string
  readonly coverUrl?: string
  readonly coverPosition?: string
  readonly content: string
  readonly toc?: boolean
  readonly tocDepth?: number
}

export interface MarkdownFrontmatter extends PageFileData {}

const needsQuote = (s: string): boolean => s === '' || /[:#"'\n]|^\s|\s$/.test(s)

const escapeYaml = (s: string): string =>
  needsQuote(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"` : s

const unquoteYaml = (v: string): string => {
  const t = v.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return t
}

const parseYamlBoolean = (value: string): boolean | undefined => {
  const normalized = unquoteYaml(value).trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

const parseTocDepth = (value: string): number | undefined => {
  const depth = Number.parseInt(unquoteYaml(value).trim(), 10)
  if (!Number.isInteger(depth) || depth < 1) return undefined
  return Math.min(depth, 6)
}

const tocFrontmatterLines = (data: Pick<PageFileData, 'toc' | 'tocDepth'>): string[] => [
  data.toc === undefined ? '' : `toc: ${data.toc ? 'true' : 'false'}`,
  data.tocDepth === undefined ? '' : `tocDepth: ${data.tocDepth}`,
].filter(Boolean)

export const contentWithTocFrontmatter = (data: Pick<PageFileData, 'content' | 'toc' | 'tocDepth'>): string => {
  const parsed = parseMarkdownFrontmatter(data.content)
  const toc = data.toc ?? parsed.toc
  const tocDepth = data.tocDepth ?? parsed.tocDepth
  const lines = tocFrontmatterLines({ toc, tocDepth })
  if (!lines.length) return parsed.content
  const body = parsed.content.endsWith('\n') ? parsed.content : `${parsed.content}\n`
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}

/** Serialize a page into frontmatter + body. */
export const serializePageFile = (data: PageFileData): string => {
  const parsedContent = parseMarkdownFrontmatter(data.content)
  const toc = data.toc ?? parsedContent.toc
  const tocDepth = data.tocDepth ?? parsedContent.tocDepth
  const frontmatter = [
    '---',
    `title: ${escapeYaml(data.title)}`,
    `description: ${escapeYaml(data.description)}`,
    data.icon ? `icon: ${escapeYaml(data.icon)}` : '',
    data.coverUrl ? `coverUrl: ${escapeYaml(data.coverUrl)}` : '',
    data.coverPosition ? `coverPosition: ${escapeYaml(data.coverPosition)}` : '',
    ...tocFrontmatterLines({ toc, tocDepth }),
    '---',
  ].filter(Boolean).join('\n')
  const body = parsedContent.content.endsWith('\n') ? parsedContent.content : `${parsedContent.content}\n`
  return `${frontmatter}\n\n${body}`
}

/** Parse markdown frontmatter and return the stripped body. */
export const parseMarkdownFrontmatter = (raw: string): MarkdownFrontmatter => {
  const text = (raw ?? '').replace(/^﻿/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  let title = ''
  let description = ''
  let icon = ''
  let coverUrl = ''
  let coverPosition = ''
  let toc: boolean | undefined
  let tocDepth: number | undefined
  let content = text

  if (match) {
    content = text.slice(match[0].length).replace(/^\r?\n/, '')
    for (const line of (match[1] ?? '').split(/\r?\n/)) {
      const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
      if (!kv) continue
      if (kv[1] === 'title') title = unquoteYaml(kv[2] ?? '')
      else if (kv[1] === 'description') description = unquoteYaml(kv[2] ?? '')
      else if (kv[1] === 'icon') icon = unquoteYaml(kv[2] ?? '')
      else if (kv[1] === 'coverUrl') coverUrl = unquoteYaml(kv[2] ?? '')
      else if (kv[1] === 'coverPosition') coverPosition = unquoteYaml(kv[2] ?? '')
      else if (kv[1] === 'toc') toc = parseYamlBoolean(kv[2] ?? '')
      else if (kv[1] === 'tocDepth') tocDepth = parseTocDepth(kv[2] ?? '')
    }
  }

  return {
    title,
    description,
    ...(icon ? { icon } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(coverPosition ? { coverPosition } : {}),
    content,
    ...(toc === undefined ? {} : { toc }),
    ...(tocDepth === undefined ? {} : { tocDepth }),
  }
}

/** Parse a markdown file (with optional frontmatter) back into page fields. */
export const parsePageFile = (raw: string): PageFileData => parseMarkdownFrontmatter(raw)

/** Page path → repo-relative file path (under the content/ root). */
export const pageFilePath = (path: string): string => `${path}.md`

const MARKDOWN_EXTENSION = '.md'
const CONTENT_ROOT = 'content'
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/
const WINDOWS_DRIVE = /^[A-Za-z]:/
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i

const isUnsafeSegment = (segment: string): boolean =>
  segment.length === 0 || segment === '.' || segment === '..'

/** Repo-relative content file path -> normalized page path, or null if invalid. */
export const filePathToPagePath = (file: string): string | null => {
  if (file.length === 0) return null
  if (file !== file.trim()) return null
  if (CONTROL_CHAR.test(file)) return null
  if (file.includes('\\') || file.startsWith('/') || WINDOWS_DRIVE.test(file)) return null
  if (ENCODED_PATH_SEPARATOR.test(file)) return null

  const parts = file.split('/')
  if (parts[0] !== CONTENT_ROOT) return null
  if (parts.some(isUnsafeSegment)) return null

  const filename = parts.at(-1)
  if (!filename?.endsWith(MARKDOWN_EXTENSION)) return null

  const stem = filename.slice(0, -MARKDOWN_EXTENSION.length)
  const pageSegments = [...parts.slice(1, -1), stem]
  if (pageSegments.some(isUnsafeSegment)) return null

  const normalizedSegments = pageSegments.map((segment) => normalizePath(segment))
  return normalizedSegments.every((segment) => segment.length > 0) ? normalizedSegments.join('/') : null
}
