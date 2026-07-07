/**
 * Search service — SQLite FTS5 with BM25 ranking and highlighted snippets.
 *
 * Mirrors the *idea* of Wiki.js's weighted PostgreSQL `tsvector` (title ≫
 * description ≫ body) but with a single, zero-dependency backend. We build a
 * forgiving prefix query so search feels good as-you-type.
 */
import { eq } from 'drizzle-orm'
import {
  type AppError,
  type Principal,
  type Result,
  ok,
  requirePermission,
  toPlainText,
} from '@ts-wiki/core'
import type { DB } from '../db/client.ts'
import { pages } from '../db/schema.ts'
import { runMigrations, type FtsTokenizer } from '../db/migrate.ts'

export interface SearchHit {
  readonly path: string
  readonly title: string
  readonly snippet: string
  /** BM25 score — lower (more negative) is more relevant. */
  readonly rank: number
}

export interface SearchFilters {
  readonly pathPrefix?: string
  readonly label?: string
  readonly status?: string
  readonly spaceKey?: string
  readonly locale?: string
}

export interface SearchTokenizerHint {
  readonly kind: 'cjk-tokenizer'
  readonly tokenizer: FtsTokenizer
  readonly recommendedTokenizer: 'trigram'
  readonly message: string
}

export interface SearchShortQueryHint {
  readonly kind: 'trigram-short-query'
  readonly tokenizer: 'trigram'
  readonly terms: readonly string[]
  readonly message: string
}

export interface SearchResponse {
  readonly query: string
  readonly hits: SearchHit[]
  readonly tokenizerHint?: SearchTokenizerHint
  readonly shortQueryHint?: SearchShortQueryHint
  readonly truncatedTerms?: readonly string[]
}

export interface SearchIndexStatus {
  readonly tokenizer: FtsTokenizer
  readonly configuredTokenizer: FtsTokenizer
  readonly totalPages: number
  readonly cjkPages: number
  readonly cjkPageRatio: number
  readonly indexedCharacters: number
  readonly cjkCharacters: number
  readonly cjkCharacterRatio: number
  readonly recommendedTokenizer: FtsTokenizer
  readonly needsTrigram: boolean
}

export interface SearchIndexRebuildInput {
  readonly tokenizer?: FtsTokenizer
}

export interface SearchService {
  /**
   * @param canRead Optional per-page read predicate. When supplied, hits the
   *   principal is not allowed to read (via page rules) are filtered out, so
   *   search never leaks titles/paths/snippets past `page:read` ACLs.
   */
  search(
    query: string,
    limit?: number,
    filters?: SearchFilters,
    canRead?: (path: string) => boolean,
  ): SearchResponse
  indexStatus(principal: Principal | null): Result<SearchIndexStatus, AppError>
  rebuildIndex(principal: Principal | null, input?: SearchIndexRebuildInput): Result<SearchIndexStatus, AppError>
}

export interface SearchServiceOptions {
  readonly configuredTokenizer?: FtsTokenizer
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u

export const containsCjk = (value: string): boolean => CJK_RE.test(value)

const indexedText = (page: { title: string; description: string; content: string }): string =>
  `${page.title}\n${page.description}\n${toPlainText(page.content)}`

const countSearchCharacters = (value: string): { total: number; cjk: number } => {
  let total = 0
  let cjk = 0
  for (const char of value) {
    if (/\s/u.test(char)) continue
    total += 1
    if (CJK_RE.test(char)) cjk += 1
  }
  return { total, cjk }
}

const cleanSearchTerms = (raw: string): string[] => {
  const cleaned = (raw ?? '').toLowerCase().replace(/["()*:^]/g, ' ').trim()
  if (!cleaned) return []
  return cleaned.split(/\s+/).filter(Boolean)
}

/**
 * Turn raw user input into a safe FTS5 MATCH expression. We strip the FTS
 * operator characters and turn each term into a prefix query, AND-ed together.
 *   `"hello wor"` → `hello* wor*`
 */
export const buildMatchQuery = (raw: string): string | null => {
  const terms = cleanSearchTerms(raw)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"*`).join(' ')
}

const readFtsTokenizer = (db: DB, fallback: FtsTokenizer): FtsTokenizer => {
  const row = db.$client
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pages_fts'")
    .get() as { sql?: unknown } | null
  const sql = typeof row?.sql === 'string' ? row.sql.toLowerCase() : ''
  if (sql.includes('trigram')) return 'trigram'
  if (sql.includes('unicode61')) return 'unicode61'
  return fallback
}

const tokenizerHint = (query: string, tokenizer: FtsTokenizer): SearchTokenizerHint | undefined =>
  tokenizer === 'unicode61' && containsCjk(query)
    ? {
        kind: 'cjk-tokenizer',
        tokenizer,
        recommendedTokenizer: 'trigram',
        message: 'This query contains CJK characters. Rebuild the search index with the trigram tokenizer for better Japanese/CJK matching.',
      }
    : undefined

const codePointLength = (value: string): number => Array.from(value).length

const trigramShortTerms = (terms: readonly string[], tokenizer: FtsTokenizer): string[] =>
  tokenizer === 'trigram' ? terms.filter((term) => codePointLength(term) < 3) : []

const shortQueryHint = (terms: readonly string[]): SearchShortQueryHint | undefined =>
  terms.length > 0
    ? {
        kind: 'trigram-short-query',
        tokenizer: 'trigram',
        terms,
        message: 'Short trigram queries use a bounded substring scan, so ranking may be less precise.',
      }
    : undefined

export const rebuildSearchIndex = (db: DB, tokenizer: FtsTokenizer): void => {
  db.$client.prepare('DROP TABLE IF EXISTS pages_fts').run()
  runMigrations(db.$client, { ftsTokenizer: tokenizer })
  const insert = db.$client.prepare(
    'INSERT INTO pages_fts(page_id, title, description, content) VALUES (?, ?, ?, ?)',
  )
  for (const page of db.select().from(pages).where(eq(pages.lifecycle, 'active')).all()) {
    insert.run(page.id, page.title, page.description, toPlainText(page.content))
  }
}

export const createSearchService = (db: DB, options: SearchServiceOptions = {}): SearchService => {
  const configuredTokenizer = options.configuredTokenizer ?? 'unicode61'
  const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`)
  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const likeSnippet = (row: { title: string; description: string; content: string }, terms: readonly string[]): string => {
    const sources = [row.title, row.description, toPlainText(row.content)].filter(Boolean)
    const source = sources.find((value) => terms.some((term) => value.toLowerCase().includes(term))) ?? sources[0] ?? ''
    const lower = source.toLowerCase()
    const first = terms
      .map((term) => lower.indexOf(term))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0] ?? 0
    const start = Math.max(first - 48, 0)
    const end = Math.min(start + 140, source.length)
    let snippet = escapeHtml(source.slice(start, end))
    for (const term of [...terms].sort((a, b) => b.length - a.length)) {
      const escapedTerm = escapeHtml(term)
      snippet = snippet.replace(new RegExp(escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), '<mark>$&</mark>')
    }
    return `${start > 0 ? '…' : ''}${snippet}${end < source.length ? '…' : ''}`
  }

  const likeRank = (row: { title: string; description: string; content: string }, terms: readonly string[]): number => {
    const title = row.title.toLowerCase()
    const description = row.description.toLowerCase()
    const content = row.content.toLowerCase()
    return terms.reduce((rank, term) => {
      if (title.includes(term)) return rank - 10
      if (description.includes(term)) return rank - 5
      if (content.includes(term)) return rank - 1
      return rank
    }, 0)
  }

  const likeSearch = (
    query: string,
    terms: readonly string[],
    limit: number,
    filters: SearchFilters,
    canRead?: (path: string) => boolean,
  ): SearchResponse => {
    const pathPrefix = filters.pathPrefix?.trim()
    const label = filters.label?.trim()
    const status = filters.status?.trim()
    const spaceKey = filters.spaceKey?.trim()
    const locale = filters.locale?.trim()
    const fetchLimit = canRead ? Math.min(Math.max(limit * 8, 40), 400) : limit
    const termWhere = terms
      .map(() => '(lower(p.title) LIKE ? ESCAPE \'\\\' OR lower(p.description) LIKE ? ESCAPE \'\\\' OR lower(p.content) LIKE ? ESCAPE \'\\\')')
      .join(' AND ')
    const rows = db.$client.prepare(`
      SELECT
        p.path AS path,
        p.title AS title,
        p.description AS description,
        p.content AS content
      FROM pages p
      WHERE p.lifecycle = 'active'
        AND ${termWhere}
        AND (? IS NULL OR p.path LIKE ?)
        AND (? IS NULL OR p.labels LIKE ?)
        AND (? IS NULL OR p.status = ?)
        AND (? IS NULL OR p.space_key = ?)
        AND (? IS NULL OR p.locale = ?)
      ORDER BY p.updated_at DESC, p.path
      LIMIT ?
    `).all(
      ...terms.flatMap((term) => {
        const like = `%${escapeLike(term)}%`
        return [like, like, like]
      }),
      pathPrefix || null,
      pathPrefix ? `${pathPrefix.replace(/[%_]/g, '')}%` : null,
      label || null,
      label ? `%"${label.replace(/[%_"]/g, '')}"%` : null,
      status || null,
      status || null,
      spaceKey || null,
      spaceKey || null,
      locale || null,
      locale || null,
      fetchLimit,
    ) as Array<{ path: string; title: string; description: string; content: string }>
    const visible = (canRead ? rows.filter((row) => canRead(row.path)) : rows)
      .map((row): SearchHit => ({
        path: row.path,
        title: row.title,
        snippet: likeSnippet(row, terms),
        rank: likeRank(row, terms),
      }))
      .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
      .slice(0, limit)
    const hint = shortQueryHint(terms.filter((term) => codePointLength(term) < 3))
    return {
      query,
      hits: visible,
      ...(hint ? { shortQueryHint: hint, truncatedTerms: hint.terms } : {}),
    }
  }

  // bm25 weights line up with the FTS columns: page_id, title, description, content.
  // Snippet markup is safe: the `content` column is stored via toPlainText(), which
  // renders Markdown with raw-HTML disabled and strips tags, so it is already
  // HTML-entity-encoded — the only live markup in a snippet is the <mark> we add.
  const prepareSearchStatement = () => db.$client.prepare(`
    SELECT
      p.path  AS path,
      p.title AS title,
      snippet(pages_fts, 3, '<mark>', '</mark>', '…', 12) AS snippet,
      bm25(pages_fts, 0.0, 10.0, 5.0, 1.0) AS rank
    FROM pages_fts
    JOIN pages p ON p.id = pages_fts.page_id
    WHERE pages_fts MATCH ?
      AND p.lifecycle = 'active'
      AND (? IS NULL OR p.path LIKE ?)
      AND (? IS NULL OR p.labels LIKE ?)
      AND (? IS NULL OR p.status = ?)
      AND (? IS NULL OR p.space_key = ?)
      AND (? IS NULL OR p.locale = ?)
    ORDER BY rank
    LIMIT ?
  `)
  let stmt = prepareSearchStatement()

  const status = (): SearchIndexStatus => {
    const activePages = db.select().from(pages).where(eq(pages.lifecycle, 'active')).all()
    let cjkPages = 0
    let indexedCharacters = 0
    let cjkCharacters = 0
    for (const page of activePages) {
      const text = indexedText(page)
      if (containsCjk(text)) cjkPages += 1
      const counts = countSearchCharacters(text)
      indexedCharacters += counts.total
      cjkCharacters += counts.cjk
    }
    const tokenizer = readFtsTokenizer(db, configuredTokenizer)
    const cjkPageRatio = activePages.length === 0 ? 0 : cjkPages / activePages.length
    const cjkCharacterRatio = indexedCharacters === 0 ? 0 : cjkCharacters / indexedCharacters
    const needsTrigram = tokenizer === 'unicode61' && cjkCharacters > 0
    return {
      tokenizer,
      configuredTokenizer,
      totalPages: activePages.length,
      cjkPages,
      cjkPageRatio,
      indexedCharacters,
      cjkCharacters,
      cjkCharacterRatio,
      recommendedTokenizer: needsTrigram ? 'trigram' : tokenizer,
      needsTrigram,
    }
  }

  return {
    search(query, limit = 20, filters = {}, canRead) {
      const tokenizer = readFtsTokenizer(db, configuredTokenizer)
      const hint = tokenizerHint(query, tokenizer)
      const terms = cleanSearchTerms(query)
      const shortTerms = trigramShortTerms(terms, tokenizer)
      if (terms.length > 0 && shortTerms.length > 0) {
        return likeSearch(query, terms, limit, filters, canRead)
      }
      const match = buildMatchQuery(query)
      if (!match) return { query, hits: [], ...(hint ? { tokenizerHint: hint } : {}) }
      const pathPrefix = filters.pathPrefix?.trim()
      const label = filters.label?.trim()
      const status = filters.status?.trim()
      const spaceKey = filters.spaceKey?.trim()
      const locale = filters.locale?.trim()
      // When we have to ACL-filter, over-fetch a bounded candidate window so a
      // few denied pages don't shrink the visible result set below `limit`.
      const fetchLimit = canRead ? Math.min(Math.max(limit * 8, 40), 400) : limit
      try {
        const rows = stmt.all(
          match,
          pathPrefix || null,
          pathPrefix ? `${pathPrefix.replace(/[%_]/g, '')}%` : null,
          label || null,
          label ? `%"${label.replace(/[%_"]/g, '')}"%` : null,
          status || null,
          status || null,
          spaceKey || null,
          spaceKey || null,
          locale || null,
          locale || null,
          fetchLimit,
        ) as SearchHit[]
        const visible = canRead ? rows.filter((row) => canRead(row.path)) : rows
        return { query, hits: visible.slice(0, limit), ...(hint ? { tokenizerHint: hint } : {}) }
      } catch {
        // Malformed FTS expression — treat as no results rather than 500.
        return { query, hits: [], ...(hint ? { tokenizerHint: hint } : {}) }
      }
    },

    indexStatus(principal) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      return ok(status())
    },

    rebuildIndex(principal, input = {}) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      rebuildSearchIndex(db, input.tokenizer ?? 'trigram')
      stmt = prepareSearchStatement()
      return ok(status())
    },
  }
}
