import type { UserRecord } from './users.ts'

export interface AuthAccountRecord {
  readonly id: string
  readonly userId: string
  readonly provider: string
  readonly providerSubject: string
  readonly email: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface AuthAccountRepository {
  findLinkedUser(provider: string, providerSubject: string): Promise<UserRecord | undefined>
  link(account: AuthAccountRecord): Promise<void>
  createUserWithAccount(user: UserRecord, account: AuthAccountRecord): Promise<void>
}
