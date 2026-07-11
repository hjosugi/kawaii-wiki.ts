import { and, eq } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { isUniqueConstraintError } from '../errors.ts'
import { authAccounts, users } from '../schema.ts'
import type {
  AuthAccountRecord,
  AuthAccountRepository,
} from '../../repositories/auth-accounts.ts'
import { DuplicateUserEmailError, type UserRecord } from '../../repositories/users.ts'

export const createSqliteAuthAccountRepository = (db: DB): AuthAccountRepository => ({
  async findLinkedUser(provider, providerSubject) {
    const row = db
      .select({ user: users })
      .from(authAccounts)
      .innerJoin(users, eq(users.id, authAccounts.userId))
      .where(and(eq(authAccounts.provider, provider), eq(authAccounts.providerSubject, providerSubject)))
      .get()
    return row?.user
  },

  async link(account: AuthAccountRecord) {
    db.transaction((tx) => {
      const existing = tx
        .select({ id: authAccounts.id })
        .from(authAccounts)
        .where(and(
          eq(authAccounts.provider, account.provider),
          eq(authAccounts.providerSubject, account.providerSubject),
        ))
        .get()
      if (existing) {
        tx.update(authAccounts)
          .set({ userId: account.userId, email: account.email, updatedAt: account.updatedAt })
          .where(eq(authAccounts.id, existing.id))
          .run()
        return
      }
      tx.insert(authAccounts).values(account).run()
    })
  },

  async createUserWithAccount(user: UserRecord, account: AuthAccountRecord) {
    try {
      db.transaction((tx) => {
        tx.insert(users).values(user).run()
        tx.insert(authAccounts).values(account).run()
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new DuplicateUserEmailError()
      throw error
    }
  },
})
