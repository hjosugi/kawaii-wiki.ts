import { and, asc, eq } from 'drizzle-orm'
import type { MysqlDb } from '../client.ts'
import { pageComments, pages, users } from '../schema.ts'
import type { CommentRepository } from '../../../repositories/comments.ts'

/** MySQL implementation of the driver-neutral comment contract. */
export const createMysqlCommentRepository = (db: MysqlDb): CommentRepository => ({
  async findActivePage(path) {
    const [row] = await db
      .select({ id: pages.id, path: pages.path, labels: pages.labels })
      .from(pages)
      .where(and(eq(pages.path, path), eq(pages.lifecycle, 'active')))
      .limit(1)
    return row
  },

  async findById(id) {
    const [row] = await db.select().from(pageComments).where(eq(pageComments.id, id)).limit(1)
    return row
  },

  async listByPageId(pageId) {
    const rows = await db
      .select({ comment: pageComments, authorName: users.name })
      .from(pageComments)
      .leftJoin(users, eq(users.id, pageComments.authorId))
      .where(eq(pageComments.pageId, pageId))
      .orderBy(asc(pageComments.createdAt))
    return rows.map((row) => ({ comment: row.comment, authorName: row.authorName ?? null }))
  },

  async findAuthorName(userId) {
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
    return row?.name ?? null
  },

  async insert(comment) {
    await db.insert(pageComments).values(comment)
  },

  // MySQL has no RETURNING; affectedRows (matched rows via the pool's FOUND_ROWS
  // flag) tells whether the target row existed.
  async updateBody(id, body, updatedAt) {
    const [result] = await db.update(pageComments).set({ body, updatedAt }).where(eq(pageComments.id, id))
    return result.affectedRows > 0
  },

  async resolve(id, resolvedAt, updatedAt) {
    const [result] = await db.update(pageComments).set({ resolvedAt, updatedAt }).where(eq(pageComments.id, id))
    return result.affectedRows > 0
  },

  async delete(id) {
    const [result] = await db.delete(pageComments).where(eq(pageComments.id, id))
    return result.affectedRows > 0
  },
})
