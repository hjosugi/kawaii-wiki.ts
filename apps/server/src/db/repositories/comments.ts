import { and, asc, eq } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { pageComments, pages, users } from '../schema.ts'
import type { CommentRepository } from '../../repositories/comments.ts'

export const createSqliteCommentRepository = (db: DB): CommentRepository => ({
  async findActivePage(path) {
    return db.select({ id: pages.id, path: pages.path, labels: pages.labels })
      .from(pages)
      .where(and(eq(pages.path, path), eq(pages.lifecycle, 'active')))
      .get()
  },

  async findById(id) {
    return db.select().from(pageComments).where(eq(pageComments.id, id)).get()
  },

  async listByPageId(pageId) {
    return db.select({ comment: pageComments, authorName: users.name })
      .from(pageComments)
      .leftJoin(users, eq(users.id, pageComments.authorId))
      .where(eq(pageComments.pageId, pageId))
      .orderBy(asc(pageComments.createdAt))
      .all()
      .map((row) => ({ comment: row.comment, authorName: row.authorName ?? null }))
  },

  async findAuthorName(userId) {
    return db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name ?? null
  },

  async insert(comment) {
    db.insert(pageComments).values(comment).run()
  },

  async updateBody(id, body, updatedAt) {
    const result = db.$client.prepare('UPDATE page_comments SET body = ?, updated_at = ? WHERE id = ?')
      .run(body, updatedAt, id)
    return Number(result.changes ?? 0) > 0
  },

  async resolve(id, resolvedAt, updatedAt) {
    const result = db.$client.prepare('UPDATE page_comments SET resolved_at = ?, updated_at = ? WHERE id = ?')
      .run(resolvedAt, updatedAt, id)
    return Number(result.changes ?? 0) > 0
  },

  async delete(id) {
    const result = db.$client.prepare('DELETE FROM page_comments WHERE id = ?').run(id)
    return Number(result.changes ?? 0) > 0
  },
})
