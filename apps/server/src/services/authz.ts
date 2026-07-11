import {
  type Action,
  type AppError,
  type PageRuleMatcher,
  type PermissionEffect,
  type PermissionGrant,
  type PermissionPolicy,
  type PermissionSubjectType,
  type Principal,
  type Result,
  type Role,
  can,
  conflict,
  err,
  normalizePath,
  ok,
  requirePermission,
  validationError,
} from '@kawaii-wiki/core'
import {
  DuplicateAuthzGroupError,
  type AuthzGroupRecord,
  type AuthzRepository,
  type PageRuleRecord,
  type PermissionGrantRecord,
} from '../repositories/authz.ts'
import type { UserRecord } from '../repositories/users.ts'

export interface AuthzGroupView {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly description: string
  readonly members: number
  readonly createdAt: number
}

export interface CreateGroupInput {
  readonly key: string
  readonly name: string
  readonly description?: string
}

export interface UpsertPageRuleInput {
  readonly subjectType: PermissionSubjectType
  readonly subjectId?: string | null
  readonly action: Action
  readonly effect: PermissionEffect
  readonly matcher: PageRuleMatcher
  readonly pattern: string
}

export interface AuthzService {
  ensureDefaults(): Promise<void>
  principalForUser(user: UserRecord): Promise<Principal>
  principalForApiKey(apiKeyId: string, role: Role): Promise<Principal>
  canAnonymous(action: Action, path?: string): Promise<boolean>
  syncRoleGroup(userId: string, role: Role): Promise<void>
  listGroups(principal: Principal | null): Promise<Result<AuthzGroupView[], AppError>>
  createGroup(principal: Principal | null, input: CreateGroupInput): Promise<Result<AuthzGroupView, AppError>>
  addUserToGroup(principal: Principal | null, userId: string, groupKey: string): Promise<Result<{ userId: string; groupKey: string }, AppError>>
  removeUserFromGroup(principal: Principal | null, userId: string, groupKey: string): Promise<Result<{ userId: string; groupKey: string }, AppError>>
  listPageRules(principal: Principal | null): Promise<Result<PageRuleRecord[], AppError>>
  createPageRule(principal: Principal | null, input: UpsertPageRuleInput): Promise<Result<PageRuleRecord, AppError>>
  deletePageRule(principal: Principal | null, id: string): Promise<Result<{ id: string }, AppError>>
}

const ROLE_GROUPS: Record<Role, string> = {
  admin: 'admins',
  editor: 'editors',
  viewer: 'viewers',
}

const DEFAULT_GROUPS: Array<{ key: string; name: string; description: string }> = [
  { key: 'admins', name: 'Admins', description: 'Full site administration and content access.' },
  { key: 'editors', name: 'Editors', description: 'Create, update, move, and delete wiki content.' },
  { key: 'viewers', name: 'Viewers', description: 'Read wiki content.' },
  { key: 'guests', name: 'Guests', description: 'Anonymous public access.' },
]

const DEFAULT_ACTIONS: Record<'viewers' | 'editors' | 'admins' | 'guests', readonly Action[]> = {
  guests: ['page:read', 'asset:read', 'search:read'],
  viewers: ['page:read', 'asset:read', 'comment:read', 'comment:write', 'search:read'],
  editors: [
    'page:read',
    'page:create',
    'page:update',
    'page:write',
    'page:delete',
    'page:move',
    'asset:read',
    'asset:write',
    'asset:delete',
    'comment:read',
    'comment:write',
    'search:read',
  ],
  admins: [
    'page:read',
    'page:create',
    'page:update',
    'page:write',
    'page:delete',
    'page:move',
    'asset:read',
    'asset:write',
    'asset:delete',
    'comment:read',
    'comment:write',
    'search:read',
    'git:sync',
    'automation:manage',
    'admin:access',
  ],
}

const ACTIONS = new Set<Action>(Object.values(DEFAULT_ACTIONS).flat())
const EFFECTS = new Set<PermissionEffect>(['allow', 'deny'])
const SUBJECT_TYPES = new Set<PermissionSubjectType>(['user', 'group', 'anonymous'])
const MATCHERS = new Set<PageRuleMatcher>(['exact', 'prefix', 'suffix', 'regex'])

const isAction = (value: string): value is Action => ACTIONS.has(value as Action)
const isEffect = (value: string): value is PermissionEffect => EFFECTS.has(value as PermissionEffect)
const isSubjectType = (value: string): value is PermissionSubjectType => SUBJECT_TYPES.has(value as PermissionSubjectType)
const isMatcher = (value: string): value is PageRuleMatcher => MATCHERS.has(value as PageRuleMatcher)
const cleanKey = (value: string): string => normalizePath(value).replace(/\//g, '-').slice(0, 80)

const toGrant = (row: PermissionGrantRecord): PermissionGrant | null =>
  isSubjectType(row.subjectType) && isAction(row.action) && isEffect(row.effect)
    ? {
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        action: row.action,
        effect: row.effect,
      }
    : null

const toPolicyRule = (row: PageRuleRecord) =>
  isSubjectType(row.subjectType) && isAction(row.action) && isEffect(row.effect) && isMatcher(row.matcher)
    ? {
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        action: row.action,
        effect: row.effect,
        matcher: row.matcher,
        pattern: row.pattern,
      }
    : null

export const createAuthzService = (repository: AuthzRepository): AuthzService => {
  let defaultsReady: Promise<void> | null = null
  let cachedPolicy: PermissionPolicy | null = null
  let policyLoading: Promise<PermissionPolicy> | null = null
  let policyGeneration = 0

  const ensureDefaults = (): Promise<void> => {
    if (defaultsReady) return defaultsReady
    const now = Date.now()
    const defaultGroups: AuthzGroupRecord[] = DEFAULT_GROUPS.map((group) => ({
      id: crypto.randomUUID(),
      ...group,
      createdAt: now,
    }))
    const defaultGrants: PermissionGrantRecord[] = []
    for (const [groupKey, actions] of Object.entries(DEFAULT_ACTIONS) as Array<[keyof typeof DEFAULT_ACTIONS, readonly Action[]]>) {
      for (const action of actions) {
        defaultGrants.push({
          id: crypto.randomUUID(),
          subjectType: groupKey === 'guests' ? 'anonymous' : 'group',
          subjectId: groupKey === 'guests' ? null : groupKey,
          action,
          effect: 'allow',
          createdAt: now,
        })
      }
    }
    defaultsReady = repository.ensureDefaults(defaultGroups, defaultGrants).catch((error) => {
      defaultsReady = null
      throw error
    })
    return defaultsReady
  }

  const policy = async (): Promise<PermissionPolicy> => {
    if (cachedPolicy) return cachedPolicy
    if (policyLoading) return policyLoading
    const generation = policyGeneration
    const loading = (async () => {
      const [grantRows, ruleRows] = await Promise.all([
        repository.listPermissionGrants(),
        repository.listPageRules(),
      ])
      const grants = grantRows.map(toGrant).filter((grant): grant is PermissionGrant => Boolean(grant))
      const rules = ruleRows
        .map(toPolicyRule)
        .filter((rule): rule is NonNullable<ReturnType<typeof toPolicyRule>> => Boolean(rule))
      if (generation !== policyGeneration) {
        policyLoading = null
        return policy()
      }
      cachedPolicy = { grants, pageRules: rules }
      return cachedPolicy
    })()
    policyLoading = loading
    try {
      return await loading
    } finally {
      if (policyLoading === loading) policyLoading = null
    }
  }

  return {
    ensureDefaults,

    async principalForUser(user) {
      await ensureDefaults()
      const groups = await repository.groupsForUser(user.id)
      return {
        id: user.id,
        role: user.role,
        groups: [...new Set([ROLE_GROUPS[user.role], ...groups])],
        policy: await policy(),
      }
    },

    async principalForApiKey(apiKeyId, role) {
      await ensureDefaults()
      return {
        id: `api-key:${apiKeyId}`,
        role,
        groups: [ROLE_GROUPS[role]],
        policy: await policy(),
      }
    },

    async canAnonymous(action, path) {
      await ensureDefaults()
      return can(null, action, { path }, await policy())
    },

    async syncRoleGroup(userId, role) {
      await ensureDefaults()
      await repository.syncRoleGroup(userId, ROLE_GROUPS[role], Object.values(ROLE_GROUPS), Date.now())
    },

    async listGroups(principal) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      await ensureDefaults()
      return ok(await repository.listGroups())
    },

    async createGroup(principal, input) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      const key = cleanKey(input.key)
      if (!key) return err(validationError('Group key is required', 'key'))
      if (await repository.findGroup(key)) return err(conflict('Group already exists'))
      const group: AuthzGroupRecord = {
        id: crypto.randomUUID(),
        key,
        name: input.name.trim() || key,
        description: input.description?.trim() ?? '',
        createdAt: Date.now(),
      }
      try {
        await repository.insertGroup(group)
      } catch (error) {
        if (error instanceof DuplicateAuthzGroupError) return err(conflict('Group already exists'))
        throw error
      }
      return ok({ ...group, members: 0 })
    },

    async addUserToGroup(principal, userId, groupKey) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      await ensureDefaults()
      const key = await repository.addUserToGroup(userId, cleanKey(groupKey), Date.now())
      if (!key) return err(validationError('Group not found', 'groupKey'))
      return ok({ userId, groupKey: key })
    },

    async removeUserFromGroup(principal, userId, groupKey) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      const key = await repository.removeUserFromGroup(userId, cleanKey(groupKey))
      if (!key) return err(validationError('Group not found', 'groupKey'))
      return ok({ userId, groupKey: key })
    },

    async listPageRules(principal) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      return ok(await repository.listPageRules())
    },

    async createPageRule(principal, input) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      if (!ACTIONS.has(input.action)) return err(validationError('Unknown action', 'action'))
      if (!EFFECTS.has(input.effect)) return err(validationError('Unknown effect', 'effect'))
      if (!SUBJECT_TYPES.has(input.subjectType)) return err(validationError('Unknown subject type', 'subjectType'))
      if (!MATCHERS.has(input.matcher)) return err(validationError('Unknown matcher', 'matcher'))
      const pattern = input.matcher === 'regex' ? input.pattern.trim() : normalizePath(input.pattern)
      if (!pattern) return err(validationError('Rule pattern is required', 'pattern'))
      const rule: PageRuleRecord = {
        id: crypto.randomUUID(),
        subjectType: input.subjectType,
        subjectId: input.subjectType === 'anonymous' ? null : input.subjectId?.trim() || null,
        action: input.action,
        effect: input.effect,
        matcher: input.matcher,
        pattern,
        createdAt: Date.now(),
      }
      await repository.insertPageRule(rule)
      cachedPolicy = null
      policyLoading = null
      policyGeneration += 1
      return ok(rule)
    },

    async deletePageRule(principal, id) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      await repository.deletePageRule(id)
      cachedPolicy = null
      policyLoading = null
      policyGeneration += 1
      return ok({ id })
    },
  }
}
