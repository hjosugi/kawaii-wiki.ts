import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { isUniqueConstraintError } from '../errors.ts'
import { pageShares, pages } from '../schema.ts'
import {
  DuplicatePageShareTokenError,
  type PageShareRepository,
} from '../../repositories/page-shares.ts'

export const createSqlitePageShareRepository = (db: DB): PageShareRepository => ({
  async findActivePage(path) {
    return db.select().from(pages)
      .where(and(eq(pages.path, path), eq(pages.lifecycle, 'active')))
      .get()
  },

  async findByToken(token) {
    return db.select().from(pageShares).where(eq(pageShares.token, token)).get()
  },

  async findActiveForPath(path, now) {
    return db.select().from(pageShares)
      .where(and(
        eq(pageShares.path, path),
        isNull(pageShares.revokedAt),
        or(isNull(pageShares.expiresAt), gt(pageShares.expiresAt, now)),
      ))
      .orderBy(desc(pageShares.createdAt))
      .get()
  },

  async insert(share) {
    try {
      db.insert(pageShares).values(share).run()
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new DuplicatePageShareTokenError()
      throw error
    }
  },

  async revoke(token, revokedAt) {
    return db.transaction((tx) => {
      const share = tx.select().from(pageShares).where(eq(pageShares.token, token)).get()
      if (!share) return undefined
      if (share.revokedAt === null) {
        tx.update(pageShares).set({ revokedAt }).where(eq(pageShares.token, token)).run()
        return { ...share, revokedAt }
      }
      return share
    })
  },
})
