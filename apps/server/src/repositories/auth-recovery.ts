import type { UserRecord } from './users.ts'

export interface PasswordResetRecord {
  readonly token: string
  readonly userId: string
  readonly expiresAt: number
  readonly createdAt: number
}

export interface EmailVerificationRecord {
  readonly token: string
  readonly userId: string
  readonly email: string
  readonly expiresAt: number
  readonly createdAt: number
}

export interface AuthRecoveryRepository {
  cleanupExpired(cutoff: number): Promise<void>
  findUserByEmail(email: string): Promise<UserRecord | undefined>
  replacePasswordReset(record: PasswordResetRecord): Promise<void>
  consumePasswordReset(
    token: string,
    now: number,
    passwordHash: string,
    tokenInvalidBefore: number,
  ): Promise<string | null>
  replaceEmailVerification(record: EmailVerificationRecord): Promise<void>
  consumeEmailVerification(token: string, now: number): Promise<string | null>
}
