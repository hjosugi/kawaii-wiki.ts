import { randomBytes } from 'node:crypto'
import {
  type AppError,
  type AuthProviderKind,
  type PublicAuthProvider,
  type Result,
  type Role,
  conflict,
  err,
  forbidden,
  ok,
  unauthorized,
  validationError,
} from '@kawaii-wiki/core'
import type { AuthEnv } from '../env.ts'
import type { AuthAccountRepository, AuthAccountRecord } from '../repositories/auth-accounts.ts'
import {
  DuplicateUserEmailError,
  type UserRecord,
  type UserRepository,
} from '../repositories/users.ts'
import { hashPassword } from './auth.ts'
import type { AuthzService } from './authz.ts'
import { isUserActive } from './users.ts'

export type AuthProviderCallbackParams = Readonly<Record<string, string | undefined>>

export interface AuthProviderLoginStart {
  readonly url: string
  readonly state?: string
}

export interface ExternalIdentity {
  readonly providerId: string
  readonly providerKind: AuthProviderKind
  readonly subject: string
  readonly email: string
  readonly name: string
  readonly emailVerified: boolean
  readonly allowRegistration: boolean
  readonly defaultRole: Role
}

export interface AuthProvider {
  readonly id: string
  readonly label: string
  readonly kind: AuthProviderKind
  startLogin(redirectAfter?: string | null): Promise<Result<AuthProviderLoginStart, AppError>>
  handleCallback(params: AuthProviderCallbackParams): Promise<Result<ExternalIdentity, AppError>>
}

export interface AuthProviderCallbackResult {
  readonly user: UserRecord
  readonly isNewUser: boolean
  readonly identity: ExternalIdentity
}

export interface AuthProviderService {
  publicProviders(): PublicAuthProvider[]
  start(providerId: string, redirectAfter?: string | null): Promise<Result<AuthProviderLoginStart, AppError>>
  callback(
    providerId: string,
    params: AuthProviderCallbackParams,
  ): Promise<Result<AuthProviderCallbackResult, AppError>>
}

export interface AuthProviderPolicy {
  readonly registration: () => AuthEnv['registration']
}

const randomUrlToken = (bytes = 32): string => Buffer.from(randomBytes(bytes)).toString('base64url')

const notFoundProvider = (): AppError => validationError('Unknown auth provider', 'provider')

const cleanEmail = (email: string): string => email.trim().toLowerCase()

export const authProviderLoginUrl = (providerId: string): string =>
  `/api/auth/${encodeURIComponent(providerId)}/start`

const publicProvider = (provider: AuthProvider): PublicAuthProvider => ({
  id: provider.id,
  label: provider.label,
  kind: provider.kind,
  type: provider.kind,
  loginUrl: authProviderLoginUrl(provider.id),
})

export const createAuthProviderService = (
  authAccounts: AuthAccountRepository,
  users: UserRepository,
  auth: AuthEnv,
  authz: AuthzService,
  providers: readonly AuthProvider[],
  policy: AuthProviderPolicy = { registration: () => auth.registration },
): AuthProviderService => {
  const byId = new Map(providers.map((provider) => [provider.id, provider]))

  const accountFor = (user: UserRecord, identity: ExternalIdentity, now = Date.now()): AuthAccountRecord => ({
    id: crypto.randomUUID(),
    userId: user.id,
    provider: identity.providerId,
    providerSubject: identity.subject,
    email: identity.email,
    createdAt: now,
    updatedAt: now,
  })

  const linkAccount = async (user: UserRecord, identity: ExternalIdentity): Promise<void> => {
    const now = Date.now()
    await authAccounts.link(accountFor(user, identity, now))
  }

  const createExternalUser = async (identity: ExternalIdentity): Promise<UserRecord> => {
    const now = Date.now()
    const user: UserRecord = {
      id: crypto.randomUUID(),
      email: identity.email,
      name: identity.name,
      passwordHash: await hashPassword(randomUrlToken(48)),
      role: identity.defaultRole,
      totpSecret: null,
      totpEnabled: 0,
      disabledAt: null,
      tokenInvalidBefore: 0,
      emailVerifiedAt: now,
      profileBio: '',
      profileCoverUrl: '',
      profileLinks: '[]',
      profileFavoritePages: '[]',
      createdAt: now,
    }
    await authAccounts.createUserWithAccount(user, accountFor(user, identity, now))
    await authz.syncRoleGroup(user.id, user.role)
    return user
  }

  const completeLogin = async (rawIdentity: ExternalIdentity): Promise<Result<AuthProviderCallbackResult, AppError>> => {
    const identity: ExternalIdentity = {
      ...rawIdentity,
      email: cleanEmail(rawIdentity.email),
      name: rawIdentity.name.trim() || cleanEmail(rawIdentity.email),
    }
    if (!identity.subject.trim()) return err(unauthorized('External subject missing'))
    if (!identity.email) return err(unauthorized('External email missing'))
    if (!identity.emailVerified) return err(unauthorized('External email is not verified'))

    const existingByAccount = await authAccounts.findLinkedUser(identity.providerId, identity.subject)
    if (existingByAccount) {
      if (!isUserActive(existingByAccount)) return err(unauthorized('Account is deactivated'))
      await linkAccount(existingByAccount, identity)
      return ok({ user: existingByAccount, isNewUser: false, identity })
    }

    const existingByEmail = await users.findByEmail(identity.email)
    if (existingByEmail) {
      if (!isUserActive(existingByEmail)) return err(unauthorized('Account is deactivated'))
      await linkAccount(existingByEmail, identity)
      return ok({ user: existingByEmail, isNewUser: false, identity })
    }

    if (!identity.allowRegistration || policy.registration() === 'off') {
      return err(forbidden('External self-registration is disabled'))
    }

    try {
      const user = await createExternalUser(identity)
      return ok({ user, isNewUser: true, identity })
    } catch (error) {
      if (!(error instanceof DuplicateUserEmailError)) throw error
      const racedUser = await users.findByEmail(identity.email)
      if (!isUserActive(racedUser)) return err(conflict('External account registration conflicted'))
      await linkAccount(racedUser, identity)
      return ok({ user: racedUser, isNewUser: false, identity })
    }
  }

  return {
    publicProviders() {
      return providers.map(publicProvider)
    },

    async start(providerId, redirectAfter = null) {
      const provider = byId.get(providerId)
      if (!provider) return err(notFoundProvider())
      return provider.startLogin(redirectAfter)
    },

    async callback(providerId, params) {
      const provider = byId.get(providerId)
      if (!provider) return err(notFoundProvider())
      const identity = await provider.handleCallback(params)
      if (!identity.ok) return identity
      return completeLogin(identity.value)
    },
  }
}
