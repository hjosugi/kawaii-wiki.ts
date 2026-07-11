import { eq, lte } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { emailVerifications, passwordResets, users } from '../schema.ts'
import type {
  AuthRecoveryRepository,
  EmailVerificationRecord,
  PasswordResetRecord,
} from '../../repositories/auth-recovery.ts'

export const createSqliteAuthRecoveryRepository = (db: DB): AuthRecoveryRepository => ({
  async cleanupExpired(cutoff) {
    db.transaction((tx) => {
      tx.delete(passwordResets).where(lte(passwordResets.expiresAt, cutoff)).run()
      tx.delete(emailVerifications).where(lte(emailVerifications.expiresAt, cutoff)).run()
    })
  },

  async findUserByEmail(email) {
    return db.select().from(users).where(eq(users.email, email)).get()
  },

  async replacePasswordReset(record: PasswordResetRecord) {
    db.transaction((tx) => {
      tx.delete(passwordResets).where(eq(passwordResets.userId, record.userId)).run()
      tx.insert(passwordResets).values(record).run()
    })
  },

  async consumePasswordReset(token, now, passwordHash, tokenInvalidBefore) {
    return db.transaction((tx) => {
      const row = tx.select().from(passwordResets).where(eq(passwordResets.token, token)).get()
      if (!row || row.expiresAt <= now) return null
      const user = tx.select().from(users).where(eq(users.id, row.userId)).get()
      if (!user || user.disabledAt !== null) return null
      tx.update(users)
        .set({
          passwordHash,
          tokenInvalidBefore,
          emailVerifiedAt: user.emailVerifiedAt ?? tokenInvalidBefore,
        })
        .where(eq(users.id, user.id))
        .run()
      tx.delete(passwordResets).where(eq(passwordResets.userId, user.id)).run()
      return user.id
    })
  },

  async replaceEmailVerification(record: EmailVerificationRecord) {
    db.transaction((tx) => {
      tx.delete(emailVerifications).where(eq(emailVerifications.userId, record.userId)).run()
      tx.insert(emailVerifications).values(record).run()
    })
  },

  async consumeEmailVerification(token, now) {
    return db.transaction((tx) => {
      const row = tx.select().from(emailVerifications).where(eq(emailVerifications.token, token)).get()
      if (!row || row.expiresAt <= now) return null
      const user = tx.select().from(users).where(eq(users.id, row.userId)).get()
      if (!user || user.disabledAt !== null || user.email !== row.email) return null
      tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, user.id)).run()
      tx.delete(emailVerifications).where(eq(emailVerifications.userId, user.id)).run()
      return user.id
    })
  },
})
