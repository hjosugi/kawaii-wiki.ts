import { Buffer } from 'node:buffer'
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
import type { PageShareRecord, PageShareRepository } from '../repositories/page-shares.ts'
import type { PageRecord } from '../repositories/pages.ts'

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
  readonly page: PageRecord
}

export interface CreatePageShareInput {
  readonly path: string
  readonly expiresAt?: number | null
}

export interface PageShareService {
  activeForPath(path: string, principal: Principal | null): Promise<Result<PageShareView | null, AppError>>
  create(input: CreatePageShareInput, principal: Principal | null): Promise<Result<PageShareView, AppError>>
  revoke(token: string, principal: Principal | null): Promise<Result<PageShareView, AppError>>
  resolve(token: string): Promise<Result<SharedPage, AppError>>
}

const shareToken = (): string => {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

const toView = (share: PageShareRecord): PageShareView => ({
  token: share.token,
  path: share.path,
  createdBy: share.createdBy,
  expiresAt: share.expiresAt,
  revokedAt: share.revokedAt,
  createdAt: share.createdAt,
})

export const createPageShareService = (repository: PageShareRepository): PageShareService => {
  const canManageShare = (path: string, principal: Principal | null): principal is Principal =>
    Boolean(principal && requirePermission(principal, 'page:update', { path }).ok)

  const ensureManageShare = (path: string, principal: Principal | null): Result<Principal, AppError> =>
    canManageShare(path, principal) ? ok(principal) : err(forbidden())

  const uniqueToken = async (): Promise<string> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = shareToken()
      if (!await repository.findByToken(token)) return token
    }
    return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
  }

  return {
    async activeForPath(path, principal) {
      const normalized = normalizePath(path)
      const allowed = ensureManageShare(normalized, principal)
      if (!allowed.ok) return allowed
      const share = await repository.findActiveForPath(normalized, Date.now())
      return ok(share ? toView(share) : null)
    },

    async create(input, principal) {
      const path = normalizePath(input.path)
      const allowed = ensureManageShare(path, principal)
      if (!allowed.ok) return allowed
      if (!await repository.findActivePage(path)) return err(notFound(`No page at "${path}"`))

      const now = Date.now()
      const expiresAt = input.expiresAt ?? null
      if (expiresAt !== null && expiresAt <= now) {
        return err(validationError('Share expiration must be in the future', 'expiresAt'))
      }

      const existing = await repository.findActiveForPath(path, now)
      if (existing) return ok(toView(existing))

      const share: PageShareRecord = {
        token: await uniqueToken(),
        path,
        createdBy: allowed.value.id,
        expiresAt,
        revokedAt: null,
        createdAt: now,
      }
      await repository.insert(share)
      return ok(toView(share))
    },

    async revoke(token, principal) {
      const existing = await repository.findByToken(token.trim())
      if (!existing) return err(notFound('Share link not found'))
      const allowed = ensureManageShare(existing.path, principal)
      if (!allowed.ok) return allowed
      const share = await repository.revoke(existing.token, Date.now())
      if (!share) return err(notFound('Share link not found'))
      return ok(toView(share))
    },

    async resolve(token) {
      const share = await repository.findByToken(token.trim())
      const now = Date.now()
      if (!share || share.revokedAt !== null || (share.expiresAt !== null && share.expiresAt <= now)) {
        return err(notFound('Share link not found'))
      }
      const page = await repository.findActivePage(share.path)
      if (!page) return err(notFound('Shared page not found'))
      return ok({ share: toView(share), page })
    },
  }
}
