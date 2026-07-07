import { createHash, randomBytes } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import {
  type AppError,
  type Principal,
  type Result,
  type Role,
  err,
  notFound,
  ok,
  requirePermission,
  validationError,
} from '@ts-wiki/core'
import type { DB } from '../db/client.ts'
import { apiKeys, type ApiKey } from '../db/schema.ts'
import type { AuthzService } from './authz.ts'

export const API_KEY_PREFIX = 'tswk_'

export interface ApiKeyView {
  readonly id: string
  readonly name: string
  readonly role: Role
  readonly expiresAt: number | null
  readonly lastUsedAt: number | null
  readonly revokedAt: number | null
  readonly createdAt: number
}

export interface CreatedApiKey {
  readonly apiKey: ApiKeyView
  readonly secret: string
}

export interface CreateApiKeyInput {
  readonly name: string
  readonly role?: Role
  readonly expiresAt?: number | null
}

export interface ApiKeyService {
  list(principal: Principal | null): Result<ApiKeyView[], AppError>
  create(principal: Principal | null, input: CreateApiKeyInput): Result<CreatedApiKey, AppError>
  revoke(principal: Principal | null, id: string): Result<ApiKeyView, AppError>
  resolve(secret: string | null | undefined): Promise<Principal | null>
}

const ROLES: readonly Role[] = ['admin', 'editor', 'viewer']

const hashApiKey = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex')

const generateSecret = (): string =>
  `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`

const toView = (row: ApiKey): ApiKeyView => ({
  id: row.id,
  name: row.name,
  role: row.role,
  expiresAt: row.expiresAt,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
  createdAt: row.createdAt,
})

export const createApiKeyService = (db: DB, authz: AuthzService): ApiKeyService => {
  const requireAdmin = (principal: Principal | null): Result<true, AppError> =>
    requirePermission(principal, 'admin:access')

  const findById = (id: string): ApiKey | undefined =>
    db.select().from(apiKeys).where(eq(apiKeys.id, id)).get()

  const findByHash = (keyHash: string): ApiKey | undefined =>
    db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).get()

  const uniqueSecret = (): string => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const secret = generateSecret()
      if (!findByHash(hashApiKey(secret))) return secret
    }
    return `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
  }

  return {
    list(principal) {
      const allowed = requireAdmin(principal)
      if (!allowed.ok) return allowed
      return ok(db.select().from(apiKeys).orderBy(asc(apiKeys.createdAt)).all().map(toView))
    },

    create(principal, input) {
      const allowed = requireAdmin(principal)
      if (!allowed.ok) return allowed

      const name = input.name.trim()
      if (!name) return err(validationError('API key name is required', 'name'))
      if (name.length > 100) return err(validationError('API key name must be 100 characters or fewer', 'name'))

      const role = input.role ?? 'viewer'
      if (!ROLES.includes(role)) return err(validationError('Unknown API key role', 'role'))

      const expiresAt = input.expiresAt ?? null
      if (expiresAt !== null) {
        if (!Number.isFinite(expiresAt)) return err(validationError('Expiration must be a timestamp', 'expiresAt'))
        if (Math.trunc(expiresAt) <= Date.now()) {
          return err(validationError('Expiration must be in the future', 'expiresAt'))
        }
      }

      const secret = uniqueSecret()
      const now = Date.now()
      const row: ApiKey = {
        id: crypto.randomUUID(),
        name,
        keyHash: hashApiKey(secret),
        role,
        expiresAt: expiresAt === null ? null : Math.trunc(expiresAt),
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now,
      }
      db.insert(apiKeys).values(row).run()
      return ok({ apiKey: toView(row), secret })
    },

    revoke(principal, id) {
      const allowed = requireAdmin(principal)
      if (!allowed.ok) return allowed
      const row = findById(id)
      if (!row) return err(notFound('API key not found'))
      const revokedAt = row.revokedAt ?? Date.now()
      if (row.revokedAt === null) {
        db.update(apiKeys).set({ revokedAt }).where(eq(apiKeys.id, row.id)).run()
      }
      return ok(toView({ ...row, revokedAt }))
    },

    async resolve(secret) {
      if (!secret?.startsWith(API_KEY_PREFIX)) return null
      const row = findByHash(hashApiKey(secret))
      const now = Date.now()
      if (!row || row.revokedAt !== null || (row.expiresAt !== null && row.expiresAt <= now)) {
        return null
      }
      db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.id)).run()
      return authz.principalForApiKey(row.id, row.role)
    },
  }
}
