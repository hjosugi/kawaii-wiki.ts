/**
 * Search service — SQLite FTS5 with BM25 ranking and highlighted snippets.
 *
 * Mirrors the *idea* of Wiki.js's weighted PostgreSQL `tsvector` (title ≫
 * description ≫ body) but with a single, zero-dependency backend. We build a
 * forgiving prefix query so search feels good as-you-type.
 */
import type { DB } from '../db/client.ts'

export interface SearchHit {
  readonly path: string
  readonly title: string
  readonly snippet: string
  /** BM25 score — lower (more negative) is more relevant. */
  readonly rank: number
}

export interface SearchResponse {
  readonly query: string
  readonly hits: SearchHit[]
}

export interface SearchService {
  search(query: string, limit?: number): SearchResponse
}

/**
 * Turn raw user input into a safe FTS5 MATCH expression. We strip the FTS
 * operator characters and turn each term into a prefix query, AND-ed together.
 *   `"hello wor"` → `hello* wor*`
 */
export const buildMatchQuery = (raw: string): string | null => {
  const cleaned = (raw ?? '').toLowerCase().replace(/["()*:^]/g, ' ').trim()
  if (!cleaned) return null
  const terms = cleaned.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"*`).join(' ')
}

export const createSearchService = (db: DB): SearchService => {
  // bm25 weights line up with the FTS columns: page_id, title, description, content.
  const stmt = db.$client.prepare(`
    SELECT
      p.path  AS path,
      p.title AS title,
      snippet(pages_fts, 3, '<mark>', '</mark>', '…', 12) AS snippet,
      bm25(pages_fts, 0.0, 10.0, 5.0, 1.0) AS rank
    FROM pages_fts
    JOIN pages p ON p.id = pages_fts.page_id
    WHERE pages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `)

  return {
    search(query, limit = 20) {
      const match = buildMatchQuery(query)
      if (!match) return { query, hits: [] }
      try {
        const hits = stmt.all(match, limit) as SearchHit[]
        return { query, hits }
      } catch {
        // Malformed FTS expression — treat as no results rather than 500.
        return { query, hits: [] }
      }
    },
  }
}
