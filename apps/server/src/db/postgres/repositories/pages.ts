import { asc, desc, eq, lt, ne, sql } from 'drizzle-orm'
import type { PostgresDb } from '../client.ts'
import { pageRedirects, pageRevisions, pages, users } from '../schema.ts'
import type { PageReadRepository } from '../../../repositories/pages.ts'

// SQLite tie-broke revision order on rowid; Postgres has none, so fall back to
// the revision id for a stable, deterministic secondary order.
const revisionOrder = [desc(pageRevisions.createdAt), desc(pageRevisions.id)] as const

/** PostgreSQL implementation of the driver-neutral page-read contract. */
export const createPostgresPageReadRepository = (db: PostgresDb): PageReadRepository => ({
  async listActive() {
    return db.select().from(pages).where(eq(pages.lifecycle, 'active')).orderBy(asc(pages.path))
  },

  async listInactive() {
    return db.select().from(pages).where(ne(pages.lifecycle, 'active')).orderBy(desc(pages.updatedAt))
  },

  async listRecentRevisions(before, limit) {
    const selection = {
      id: pageRevisions.id,
      path: pageRevisions.path,
      title: pageRevisions.title,
      authorId: pageRevisions.authorId,
      authorName: users.name,
      action: pageRevisions.action,
      createdAt: pageRevisions.createdAt,
    }
    const base = db.select(selection).from(pageRevisions).leftJoin(users, eq(users.id, pageRevisions.authorId))
    const filtered = before === null ? base : base.where(lt(pageRevisions.createdAt, before))
    const rows = await filtered.orderBy(...revisionOrder).limit(limit)
    return rows.map((row) => ({ ...row, authorName: row.authorName ?? null }))
  },

  async listRedirects() {
    return db.select().from(pageRedirects).orderBy(asc(pageRedirects.fromPath))
  },

  async listRevisions(pageId) {
    const rows = await db
      .select({
        id: pageRevisions.id,
        pageId: pageRevisions.pageId,
        path: pageRevisions.path,
        title: pageRevisions.title,
        description: pageRevisions.description,
        content: pageRevisions.content,
        authorId: pageRevisions.authorId,
        authorName: users.name,
        action: pageRevisions.action,
        createdAt: pageRevisions.createdAt,
      })
      .from(pageRevisions)
      .leftJoin(users, eq(users.id, pageRevisions.authorId))
      .where(eq(pageRevisions.pageId, pageId))
      .orderBy(...revisionOrder)
    return rows.map((row) => ({ ...row, authorName: row.authorName ?? null }))
  },

  async revisionContributors(pageId) {
    const lastContributionAt = sql<number>`max(${pageRevisions.createdAt})`
    const rows = await db
      .select({
        authorId: pageRevisions.authorId,
        authorName: users.name,
        revisions: sql<number>`count(*)`,
        lastContributionAt,
      })
      .from(pageRevisions)
      .leftJoin(users, eq(users.id, pageRevisions.authorId))
      .where(eq(pageRevisions.pageId, pageId))
      .groupBy(pageRevisions.authorId, users.name)
      .orderBy(desc(lastContributionAt), asc(users.name))
    return rows.map((row) => ({
      ...row,
      revisions: Number(row.revisions),
      lastContributionAt: Number(row.lastContributionAt),
    }))
  },
})
