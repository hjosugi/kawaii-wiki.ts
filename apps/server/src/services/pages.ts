/**
 * Page service — the core write path. Every mutation:
 *   1. checks permission (pure `can()` from @wiki/core),
 *   2. validates & normalises input (pure `validatePageInput`),
 *   3. renders Markdown → HTML + TOC (pure `renderMarkdown`),
 *   4. persists page + revision + FTS index in ONE transaction.
 *
 * Contrast Wiki.js: render is fire-and-forget there, so fresh pages flash blank
 * and aren't searchable; storage writes aren't transactional. Here a save is
 * atomic and the page is fully rendered and indexed the instant it returns.
 */
import { eq, asc } from 'drizzle-orm'
import {
  type Result,
  ok,
  err,
  type AppError,
  type Principal,
  type PageInput,
  can,
  forbidden,
  notFound,
  conflict,
  validatePageInput,
  renderMarkdown,
  toPlainText,
} from '@wiki/core'
import type { DB } from '../db/client.ts'
import { pages, pageRevisions, type Page } from '../db/schema.ts'

export interface PageSummary {
  readonly path: string
  readonly title: string
  readonly description: string
  readonly updatedAt: number
}

export interface UpdatePagePatch {
  readonly title?: string
  readonly content?: string
  readonly description?: string
}

export interface PageService {
  list(): PageSummary[]
  getByPath(path: string): Result<Page, AppError>
  create(input: PageInput, principal: Principal | null): Result<Page, AppError>
  update(path: string, patch: UpdatePagePatch, principal: Principal | null): Result<Page, AppError>
  remove(path: string, principal: Principal | null): Result<{ path: string }, AppError>
}

export const createPageService = (db: DB): PageService => {
  // Prepared FTS5 statements (FTS5 has no UPSERT, so update = delete + insert).
  const ftsInsert = db.$client.prepare(
    'INSERT INTO pages_fts(page_id, title, description, content) VALUES (?, ?, ?, ?)',
  )
  const ftsDelete = db.$client.prepare('DELETE FROM pages_fts WHERE page_id = ?')

  const reindex = (id: string, title: string, description: string, content: string): void => {
    ftsDelete.run(id)
    ftsInsert.run(id, title, description, toPlainText(content))
  }

  const findByPath = (path: string): Page | undefined =>
    db.select().from(pages).where(eq(pages.path, path)).get()

  const findById = (id: string): Page =>
    db.select().from(pages).where(eq(pages.id, id)).get()!

  return {
    list() {
      return db
        .select({
          path: pages.path,
          title: pages.title,
          description: pages.description,
          updatedAt: pages.updatedAt,
        })
        .from(pages)
        .orderBy(asc(pages.path))
        .all()
    },

    getByPath(path) {
      const page = findByPath(path)
      return page ? ok(page) : err(notFound(`No page at "${path}"`))
    },

    create(input, principal) {
      if (!can(principal, 'page:write')) return err(forbidden())

      const validated = validatePageInput(input)
      if (!validated.ok) return validated
      const v = validated.value

      if (findByPath(v.path)) return err(conflict(`A page already exists at "${v.path}"`))

      const { html, toc } = renderMarkdown(v.content)
      const now = Date.now()
      const id = crypto.randomUUID()

      const page = db.transaction((tx) => {
        tx.insert(pages)
          .values({
            id,
            path: v.path,
            title: v.title,
            description: v.description,
            content: v.content,
            renderedHtml: html,
            toc: JSON.stringify(toc),
            contentType: 'markdown',
            authorId: principal?.id ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        tx.insert(pageRevisions)
          .values({
            id: crypto.randomUUID(),
            pageId: id,
            path: v.path,
            title: v.title,
            description: v.description,
            content: v.content,
            authorId: principal?.id ?? null,
            action: 'created',
            createdAt: now,
          })
          .run()

        reindex(id, v.title, v.description, v.content)
        return findById(id)
      })

      return ok(page)
    },

    update(path, patch, principal) {
      if (!can(principal, 'page:write')) return err(forbidden())

      const current = findByPath(path)
      if (!current) return err(notFound(`No page at "${path}"`))

      const validated = validatePageInput({
        path: current.path,
        title: patch.title ?? current.title,
        content: patch.content ?? current.content,
        // Leave undefined when not supplied so the summary is re-derived from
        // the new content rather than carrying a stale auto-description forward.
        description: patch.description,
      })
      if (!validated.ok) return validated
      const v = validated.value

      const { html, toc } = renderMarkdown(v.content)
      const now = Date.now()

      const page = db.transaction((tx) => {
        // Snapshot the pre-update state into history.
        tx.insert(pageRevisions)
          .values({
            id: crypto.randomUUID(),
            pageId: current.id,
            path: current.path,
            title: current.title,
            description: current.description,
            content: current.content,
            authorId: principal?.id ?? null,
            action: 'updated',
            createdAt: now,
          })
          .run()

        tx.update(pages)
          .set({
            title: v.title,
            description: v.description,
            content: v.content,
            renderedHtml: html,
            toc: JSON.stringify(toc),
            updatedAt: now,
          })
          .where(eq(pages.id, current.id))
          .run()

        reindex(current.id, v.title, v.description, v.content)
        return findById(current.id)
      })

      return ok(page)
    },

    remove(path, principal) {
      if (!can(principal, 'page:delete')) return err(forbidden())

      const current = findByPath(path)
      if (!current) return err(notFound(`No page at "${path}"`))

      const now = Date.now()
      db.transaction((tx) => {
        tx.insert(pageRevisions)
          .values({
            id: crypto.randomUUID(),
            pageId: current.id,
            path: current.path,
            title: current.title,
            description: current.description,
            content: current.content,
            authorId: principal?.id ?? null,
            action: 'deleted',
            createdAt: now,
          })
          .run()

        tx.delete(pages).where(eq(pages.id, current.id)).run()
        ftsDelete.run(current.id)
      })

      return ok({ path })
    },
  }
}
