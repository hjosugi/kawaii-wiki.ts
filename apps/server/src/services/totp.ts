import { and, eq, isNull } from 'drizzle-orm'
import { err, ok, type AppError, type Result, unauthorized } from '@kawaii-wiki/core'
import type { DB } from '../db/client.ts'
import { totpRecoveryCodes, users, type User } from '../db/schema.ts'
import {
  hashRecoveryCode,
  otpauthUrl,
  randomBase32Secret,
  randomRecoveryCode,
  verifyRecoveryCode,
  verifyTotpCode,
} from './auth.ts'

const RECOVERY_CODE_COUNT = 8

export interface TotpService {
  setup(user: User): Result<{ secret: string; otpauthUrl: string }, AppError>
  enable(user: User, code: string): Promise<Result<{ user: User; recoveryCodes: string[] }, AppError>>
  regenerate(user: User, code: string): Promise<Result<string[], AppError>>
  disable(user: User, code?: string): Result<User, AppError>
  consumeRecoveryCode(userId: string, code: string): Promise<boolean>
}

export const createTotpService = (db: DB, siteName: string): TotpService => {
  const issueRecoveryCodes = async (userId: string): Promise<string[]> => {
    const createdAt = Date.now()
    const codeSet = new Set<string>()
    while (codeSet.size < RECOVERY_CODE_COUNT) codeSet.add(randomRecoveryCode())
    const recoveryCodes = [...codeSet]
    const rows = await Promise.all(recoveryCodes.map(async (code) => ({
      id: crypto.randomUUID(),
      userId,
      codeHash: await hashRecoveryCode(code),
      createdAt,
      usedAt: null,
    })))
    db.transaction((tx) => {
      tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId)).run()
      for (const row of rows) tx.insert(totpRecoveryCodes).values(row).run()
    })
    return recoveryCodes
  }

  return {
    setup(user) {
      const secret = user.totpSecret || randomBase32Secret()
      db.update(users).set({ totpSecret: secret, totpEnabled: user.totpEnabled }).where(eq(users.id, user.id)).run()
      return ok({ secret, otpauthUrl: otpauthUrl(siteName, user.email, secret) })
    },

    async enable(user, code) {
      if (!user.totpSecret || !verifyTotpCode(user.totpSecret, code)) {
        return err(unauthorized('Invalid two-factor code'))
      }
      db.update(users).set({ totpEnabled: 1 }).where(eq(users.id, user.id)).run()
      const recoveryCodes = await issueRecoveryCodes(user.id)
      return ok({ user: { ...user, totpEnabled: 1 }, recoveryCodes })
    },

    async regenerate(user, code) {
      if (!user.totpEnabled || !user.totpSecret || !verifyTotpCode(user.totpSecret, code)) {
        return err(unauthorized('Invalid two-factor code'))
      }
      return ok(await issueRecoveryCodes(user.id))
    },

    disable(user, code) {
      if (user.totpEnabled && (!user.totpSecret || !code || !verifyTotpCode(user.totpSecret, code))) {
        return err(unauthorized('Invalid two-factor code'))
      }
      db.transaction((tx) => {
        tx.update(users).set({ totpSecret: null, totpEnabled: 0 }).where(eq(users.id, user.id)).run()
        tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, user.id)).run()
      })
      return ok({ ...user, totpSecret: null, totpEnabled: 0 })
    },

    async consumeRecoveryCode(userId, code) {
      const rows = db.select().from(totpRecoveryCodes)
        .where(and(eq(totpRecoveryCodes.userId, userId), isNull(totpRecoveryCodes.usedAt)))
        .all()
      for (const row of rows) {
        if (!await verifyRecoveryCode(code, row.codeHash)) continue
        const result = db.$client
          .prepare('UPDATE totp_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL')
          .run(Date.now(), row.id)
        if ((result.changes ?? 0) > 0) return true
      }
      return false
    },
  }
}
