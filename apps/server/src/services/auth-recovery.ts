import { createHash, randomBytes } from 'node:crypto'
import { eq, lte } from 'drizzle-orm'
import {
  type AppError,
  type Result,
  err,
  ok,
  unauthorized,
  validationError,
} from '@ts-wiki/core'
import type { DB } from '../db/client.ts'
import { emailVerifications, passwordResets, users, type User } from '../db/schema.ts'
import type { AuthEnv } from '../env.ts'
import { hashPassword } from './auth.ts'
import type { MailService } from './mail.ts'
import { isUserActive } from './users.ts'

const PASSWORD_RESET_TTL_MS = 30 * 60_000
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000
const RESET_EXPIRES_MINUTES = Math.round(PASSWORD_RESET_TTL_MS / 60_000)
const VERIFY_EXPIRES_HOURS = Math.round(EMAIL_VERIFICATION_TTL_MS / 60 / 60_000)

export interface AuthRecoveryService {
  mailConfigured(): boolean
  requestPasswordReset(email: string): Promise<Result<{ ok: true }, AppError>>
  resetPassword(token: string, newPassword: string): Promise<Result<{ userId: string }, AppError>>
  sendEmailVerification(user: User): Promise<Result<{ sent: boolean }, AppError>>
  verifyEmail(token: string): Result<{ userId: string }, AppError>
}

const randomToken = (): string => randomBytes(32).toString('base64url')
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')
const resetUrl = (auth: AuthEnv, token: string): string =>
  `${auth.publicOrigin}/_reset?token=${encodeURIComponent(token)}`
const verifyUrl = (auth: AuthEnv, token: string): string =>
  `${auth.publicOrigin}/_verify-email?token=${encodeURIComponent(token)}`

const validatePassword = (password: string): AppError | null =>
  password.length >= 6 ? null : validationError('Password must be at least 6 characters', 'password')

export const createAuthRecoveryService = (
  db: DB,
  auth: AuthEnv,
  mail: MailService,
  now: () => number = () => Date.now(),
): AuthRecoveryService => {
  const cleanup = (): void => {
    const cutoff = now()
    db.delete(passwordResets).where(lte(passwordResets.expiresAt, cutoff)).run()
    db.delete(emailVerifications).where(lte(emailVerifications.expiresAt, cutoff)).run()
  }

  const userByEmail = (email: string): User | undefined =>
    db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get()

  const sendReset = async (user: User): Promise<void> => {
    const createdAt = now()
    const token = randomToken()
    db.delete(passwordResets).where(eq(passwordResets.userId, user.id)).run()
    db.insert(passwordResets)
      .values({
        token: hashToken(token),
        userId: user.id,
        expiresAt: createdAt + PASSWORD_RESET_TTL_MS,
        createdAt,
      })
      .run()
    await mail.send(mail.resetPasswordMessage({
      email: user.email,
      siteName: auth.siteName,
      resetUrl: resetUrl(auth, token),
      expiresMinutes: RESET_EXPIRES_MINUTES,
    }))
  }

  return {
    mailConfigured() {
      return mail.configured()
    },

    async requestPasswordReset(email) {
      cleanup()
      const user = userByEmail(email)
      if (!mail.configured() || !isUserActive(user)) return ok({ ok: true })
      try {
        await sendReset(user)
      } catch {
        // Do not reveal whether the account exists or whether delivery failed.
      }
      return ok({ ok: true })
    },

    async resetPassword(token, newPassword) {
      cleanup()
      const invalid = validatePassword(newPassword)
      if (invalid) return err(invalid)

      const row = db.select().from(passwordResets).where(eq(passwordResets.token, hashToken(token))).get()
      if (!row || row.expiresAt <= now()) return err(unauthorized('Password reset link is invalid or expired'))
      const user = db.select().from(users).where(eq(users.id, row.userId)).get()
      if (!isUserActive(user)) return err(unauthorized('Password reset link is invalid or expired'))

      const passwordHash = await hashPassword(newPassword)
      const tokenInvalidBefore = now()
      db.update(users)
        .set({ passwordHash, tokenInvalidBefore, emailVerifiedAt: user.emailVerifiedAt ?? tokenInvalidBefore })
        .where(eq(users.id, user.id))
        .run()
      db.delete(passwordResets).where(eq(passwordResets.userId, user.id)).run()
      return ok({ userId: user.id })
    },

    async sendEmailVerification(user) {
      cleanup()
      if (!mail.configured() || !isUserActive(user)) return ok({ sent: false })
      const createdAt = now()
      const token = randomToken()
      db.delete(emailVerifications).where(eq(emailVerifications.userId, user.id)).run()
      db.insert(emailVerifications)
        .values({
          token: hashToken(token),
          userId: user.id,
          email: user.email,
          expiresAt: createdAt + EMAIL_VERIFICATION_TTL_MS,
          createdAt,
        })
        .run()
      try {
        const result = await mail.send(mail.verifyEmailMessage({
          email: user.email,
          siteName: auth.siteName,
          verifyUrl: verifyUrl(auth, token),
          expiresHours: VERIFY_EXPIRES_HOURS,
        }))
        return ok(result)
      } catch {
        return ok({ sent: false })
      }
    },

    verifyEmail(token) {
      cleanup()
      const row = db.select().from(emailVerifications).where(eq(emailVerifications.token, hashToken(token))).get()
      if (!row || row.expiresAt <= now()) return err(unauthorized('Email verification link is invalid or expired'))
      const user = db.select().from(users).where(eq(users.id, row.userId)).get()
      if (!isUserActive(user) || user.email !== row.email) {
        return err(unauthorized('Email verification link is invalid or expired'))
      }
      db.update(users).set({ emailVerifiedAt: now() }).where(eq(users.id, user.id)).run()
      db.delete(emailVerifications).where(eq(emailVerifications.userId, user.id)).run()
      return ok({ userId: user.id })
    },
  }
}
