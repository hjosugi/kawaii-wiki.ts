import { afterEach, describe, expect, test } from 'bun:test'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import type { AuthAccountRecord } from '../../repositories/auth-accounts.ts'
import type { UserRecord } from '../../repositories/users.ts'
import { createSqliteAuthAccountRepository } from './auth-accounts.ts'
import { createSqliteAuthRecoveryRepository } from './auth-recovery.ts'
import { createSqliteUserRepository } from './users.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

const user = (id: string, email = `${id}@example.com`): UserRecord => ({
  id,
  email,
  name: id,
  passwordHash: 'old-hash',
  role: 'viewer',
  totpSecret: null,
  totpEnabled: 0,
  disabledAt: null,
  tokenInvalidBefore: 0,
  emailVerifiedAt: null,
  profileBio: '',
  profileCoverUrl: '',
  profileLinks: '[]',
  profileFavoritePages: '[]',
  createdAt: 10,
})

const account = (userId: string, overrides: Partial<AuthAccountRecord> = {}): AuthAccountRecord => ({
  id: `account-${userId}`,
  userId,
  provider: 'oidc-main',
  providerSubject: 'subject-1',
  email: `${userId}@example.com`,
  createdAt: 10,
  updatedAt: 10,
  ...overrides,
})

describe.each(drivers)('%s auth repository contracts', (_driver, create) => {
  test('creates and relinks external accounts through atomic adapter operations', async () => {
    const db = create()
    databases.push(db)
    const users = createSqliteUserRepository(db)
    const accounts = createSqliteAuthAccountRepository(db)

    await accounts.createUserWithAccount(user('user-1'), account('user-1'))
    expect(await accounts.findLinkedUser('oidc-main', 'subject-1')).toMatchObject({ id: 'user-1' })

    await users.insert(user('user-2'))
    await accounts.link(account('user-2', { id: 'ignored-new-id', updatedAt: 20 }))
    expect(await accounts.findLinkedUser('oidc-main', 'subject-1')).toMatchObject({ id: 'user-2' })
  })

  test('consumes reset and verification tokens exactly once with user updates', async () => {
    const db = create()
    databases.push(db)
    const users = createSqliteUserRepository(db)
    const recovery = createSqliteAuthRecoveryRepository(db)
    await users.insert(user('user-1'))

    await recovery.replacePasswordReset({ token: 'reset-hash', userId: 'user-1', expiresAt: 100, createdAt: 10 })
    expect(await recovery.consumePasswordReset('reset-hash', 50, 'new-hash', 50)).toBe('user-1')
    expect(await recovery.consumePasswordReset('reset-hash', 50, 'other-hash', 60)).toBeNull()
    expect(await users.findById('user-1')).toMatchObject({
      passwordHash: 'new-hash',
      tokenInvalidBefore: 50,
      emailVerifiedAt: 50,
    })

    await recovery.replaceEmailVerification({
      token: 'verify-hash',
      userId: 'user-1',
      email: 'user-1@example.com',
      expiresAt: 200,
      createdAt: 100,
    })
    expect(await recovery.consumeEmailVerification('verify-hash', 150)).toBe('user-1')
    expect(await recovery.consumeEmailVerification('verify-hash', 150)).toBeNull()
    expect(await users.findById('user-1')).toMatchObject({ emailVerifiedAt: 150 })
  })

  test('cleans up expired recovery records', async () => {
    const db = create()
    databases.push(db)
    const users = createSqliteUserRepository(db)
    const recovery = createSqliteAuthRecoveryRepository(db)
    await users.insert(user('user-1'))
    await recovery.replacePasswordReset({ token: 'expired-reset', userId: 'user-1', expiresAt: 20, createdAt: 10 })
    await recovery.replaceEmailVerification({
      token: 'expired-verify',
      userId: 'user-1',
      email: 'user-1@example.com',
      expiresAt: 20,
      createdAt: 10,
    })

    await recovery.cleanupExpired(20)
    expect(await recovery.consumePasswordReset('expired-reset', 20, 'hash', 20)).toBeNull()
    expect(await recovery.consumeEmailVerification('expired-verify', 20)).toBeNull()
  })
})
