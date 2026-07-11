import type {
  Action,
  PageRuleMatcher,
  PermissionEffect,
  PermissionSubjectType,
} from '@kawaii-wiki/core'

export interface AuthzGroupRecord {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly description: string
  readonly createdAt: number
}

export interface AuthzGroupWithMembers extends AuthzGroupRecord {
  readonly members: number
}

export interface PermissionGrantRecord {
  readonly id: string
  readonly subjectType: PermissionSubjectType
  readonly subjectId: string | null
  readonly action: Action
  readonly effect: PermissionEffect
  readonly createdAt: number
}

export interface PageRuleRecord {
  readonly id: string
  readonly subjectType: PermissionSubjectType
  readonly subjectId: string | null
  readonly action: Action
  readonly effect: PermissionEffect
  readonly matcher: PageRuleMatcher
  readonly pattern: string
  readonly createdAt: number
}

export class DuplicateAuthzGroupError extends Error {
  constructor() {
    super('Group already exists')
    this.name = 'DuplicateAuthzGroupError'
  }
}

export interface AuthzRepository {
  ensureDefaults(groups: readonly AuthzGroupRecord[], grants: readonly PermissionGrantRecord[]): Promise<void>
  groupsForUser(userId: string): Promise<string[]>
  listPermissionGrants(): Promise<PermissionGrantRecord[]>
  syncRoleGroup(userId: string, roleGroupKey: string, roleGroupKeys: readonly string[], createdAt: number): Promise<void>
  listGroups(): Promise<AuthzGroupWithMembers[]>
  findGroup(key: string): Promise<AuthzGroupRecord | undefined>
  insertGroup(group: AuthzGroupRecord): Promise<void>
  addUserToGroup(userId: string, groupKey: string, createdAt: number): Promise<string | null>
  removeUserFromGroup(userId: string, groupKey: string): Promise<string | null>
  listPageRules(): Promise<PageRuleRecord[]>
  insertPageRule(rule: PageRuleRecord): Promise<void>
  deletePageRule(id: string): Promise<void>
}
