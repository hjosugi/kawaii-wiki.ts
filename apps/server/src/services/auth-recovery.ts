import { createHash, randomBytes } from 'node:crypto'
import {
  type AppError,
  type Result,
  err,
  ok,
  unauthorized,
  validationError,
} from '@kawaii-wiki/core'
import type { AuthEnv } from '../env.ts'
import type { AuthRecoveryRepository } from '../repositories/auth-recovery.ts'
import type { UserRecord } from '../repositories/users.ts'
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
  sendEmailVerification(user: UserRecord): Promise<Result<{ sent: boolean }, AppError>>
  verifyEmail(token: string): Promise<Result<{ userId: string }, AppError>>
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
  repository: AuthRecoveryRepository,
  auth: AuthEnv,
  mail: MailService,
  now: () => number = () => Date.now(),
): AuthRecoveryService => {
  const cleanup = async (): Promise<void> => repository.cleanupExpired(now())

  const sendReset = async (user: UserRecord): Promise<void> => {
    const createdAt = now()
    const token = randomToken()
    await repository.replacePasswordReset({
      token: hashToken(token),
      userId: user.id,
      expiresAt: createdAt + PASSWORD_RESET_TTL_MS,
      createdAt,
    })
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
      await cleanup()
      const user = await repository.findUserByEmail(email.trim().toLowerCase())
      if (!mail.configured() || !isUserActive(user)) return ok({ ok: true })
      try {
        await sendReset(user)
      } catch {
        // Do not reveal whether the account exists or whether delivery failed.
      }
      return ok({ ok: true })
    },

    async resetPassword(token, newPassword) {
      await cleanup()
      const invalid = validatePassword(newPassword)
      if (invalid) return err(invalid)

      const passwordHash = await hashPassword(newPassword)
      const tokenInvalidBefore = now()
      const userId = await repository.consumePasswordReset(
        hashToken(token),
        tokenInvalidBefore,
        passwordHash,
        tokenInvalidBefore,
      )
      return userId
        ? ok({ userId })
        : err(unauthorized('Password reset link is invalid or expired'))
    },

    async sendEmailVerification(user) {
      await cleanup()
      if (!mail.configured() || !isUserActive(user)) return ok({ sent: false })
      const createdAt = now()
      const token = randomToken()
      await repository.replaceEmailVerification({
        token: hashToken(token),
        userId: user.id,
        email: user.email,
        expiresAt: createdAt + EMAIL_VERIFICATION_TTL_MS,
        createdAt,
      })
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

    async verifyEmail(token) {
      await cleanup()
      const userId = await repository.consumeEmailVerification(hashToken(token), now())
      return userId
        ? ok({ userId })
        : err(unauthorized('Email verification link is invalid or expired'))
    },
  }
}
