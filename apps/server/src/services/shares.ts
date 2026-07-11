import { Buffer } from 'node:buffer'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  type AppError,
  type Principal,
  type Result,
  err,
  forbidden,
  notFound,
  normalizePath,
  ok,
  requirePermission,
  validationError,
} from '@kawaii-wiki/core'
import type { DB } from '../db/client.ts'
import { pageShares, pages, type Page, type PageShare } from '../db/schema.ts'

export interface PageShareView {
  readonly token: string
  readonly path: string
  readonly createdBy: string
  readonly expiresAt: number | null
  readonly revokedAt: number | null
  readonly createdAt: number
}

export interface SharedPage {
  readonly share: PageShareView
  readonly page: Page
}

export interface CreatePageShareInput {
  readonly path: string
  readonly expiresAt?: number | null
}

export interface PageShareService {
  activeForPath(path: string, principal: Principal | null): Result<PageShareView | null, AppError>
  create(input: CreatePageShareInput, principal: Principal | null): Result<PageShareView, AppError>
  revoke(token: string, principal: Principal | null): Result<PageShareView, AppError>
  resolve(token: string): Result<SharedPage, AppError>
}

const shareToken = (): string => {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

const toView = (share: PageShare): PageShareView => ({
  token: share.token,
  path: share.path,
  createdBy: share.createdBy,
  expiresAt: share.expiresAt,
  revokedAt: share.revokedAt,
  createdAt: share.createdAt,
})

export const createPageShareService = (db: DB): PageShareService => {
  const findPage = (path: string): Page | undefined =>
    db.select().from(pages).where(and(eq(pages.path, normalizePath(path)), eq(pages.lifecycle, 'active'))).get()

  const findToken = (token: string): PageShare | undefined =>
    db.select().from(pageShares).where(eq(pageShares.token, token.trim())).get()

  const activeWhere = (now: number) =>
    sql`${pageShares.revokedAt} IS NULL AND (${pageShares.expiresAt} IS NULL OR ${pageShares.expiresAt} > ${now})`

  const activeShareForPath = (path: string, now = Date.now()): PageShare | undefined =>
    db
      .select()
      .from(pageShares)
      .where(and(eq(pageShares.path, normalizePath(path)), activeWhere(now)))
      .orderBy(desc(pageShares.createdAt))
      .get()

  const canManageShare = (path: string, principal: Principal | null): principal is Principal =>
    Boolean(principal && requirePermission(principal, 'page:update', { path }).ok)

  const ensureManageShare = (path: string, principal: Principal | null): Result<Principal, AppError> =>
    canManageShare(path, principal) ? ok(principal) : err(forbidden())

  const uniqueToken = (): string => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = shareToken()
      if (!findToken(token)) return token
    }
    return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
  }

  return {
    activeForPath(path, principal) {
      const normalized = normalizePath(path)
      const allowed = ensureManageShare(normalized, principal)
      if (!allowed.ok) return allowed
      const share = activeShareForPath(normalized)
      return ok(share ? toView(share) : null)
    },

    create(input, principal) {
      const path = normalizePath(input.path)
      const allowed = ensureManageShare(path, principal)
      if (!allowed.ok) return allowed
      if (!findPage(path)) return err(notFound(`No page at "${path}"`))

      const now = Date.now()
      const expiresAt = input.expiresAt ?? null
      if (expiresAt !== null && expiresAt <= now) {
        return err(validationError('Share expiration must be in the future', 'expiresAt'))
      }

      const existing = activeShareForPath(path, now)
      if (existing) return ok(toView(existing))

      const share: PageShare = {
        token: uniqueToken(),
        path,
        createdBy: allowed.value.id,
        expiresAt,
        revokedAt: null,
        createdAt: now,
      }
      db.insert(pageShares).values(share).run()
      return ok(toView(share))
    },

    revoke(token, principal) {
      const share = findToken(token)
      if (!share) return err(notFound('Share link not found'))
      const allowed = ensureManageShare(share.path, principal)
      if (!allowed.ok) return allowed
      const revokedAt = share.revokedAt ?? Date.now()
      if (share.revokedAt === null) {
        db.update(pageShares).set({ revokedAt }).where(eq(pageShares.token, share.token)).run()
      }
      return ok(toView({ ...share, revokedAt }))
    },

    resolve(token) {
      const share = findToken(token)
      const now = Date.now()
      if (!share || share.revokedAt !== null || (share.expiresAt !== null && share.expiresAt <= now)) {
        return err(notFound('Share link not found'))
      }
      const page = findPage(share.path)
      if (!page) return err(notFound('Shared page not found'))
      return ok({ share: toView(share), page })
    },
  }
}
