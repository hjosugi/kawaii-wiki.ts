import { afterEach, describe, expect, test } from 'bun:test'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import {
  DuplicateAuthzGroupError,
  type AuthzGroupRecord,
  type PageRuleRecord,
  type PermissionGrantRecord,
} from '../../repositories/authz.ts'
import { createSqliteAuthzRepository } from './authz.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

const group = (id: string, key: string): AuthzGroupRecord => ({
  id,
  key,
  name: key,
  description: '',
  createdAt: 10,
})

const grant = (id: string, subjectId: string): PermissionGrantRecord => ({
  id,
  subjectType: 'group',
  subjectId,
  action: 'page:read',
  effect: 'allow',
  createdAt: 10,
})

describe.each(drivers)('%s authz repository contract', (_driver, create) => {
  test('initializes defaults idempotently and keeps one active role membership', async () => {
    const db = create()
    databases.push(db)
    const repository = createSqliteAuthzRepository(db)
    const defaults = [group('group-admins', 'admins'), group('group-editors', 'editors')]
    const grants = [grant('grant-admins', 'admins'), grant('grant-editors', 'editors')]

    await repository.ensureDefaults(defaults, grants)
    await repository.ensureDefaults(
      defaults.map((item) => ({ ...item, id: `second-${item.id}` })),
      grants.map((item) => ({ ...item, id: `second-${item.id}` })),
    )
    expect(await repository.listGroups()).toHaveLength(2)
    expect(await repository.listPermissionGrants()).toHaveLength(2)

    await repository.syncRoleGroup('user-1', 'admins', ['admins', 'editors'], 20)
    await repository.syncRoleGroup('user-1', 'admins', ['admins', 'editors'], 21)
    expect(await repository.groupsForUser('user-1')).toEqual(['admins'])
    await repository.syncRoleGroup('user-1', 'editors', ['admins', 'editors'], 22)
    expect(await repository.groupsForUser('user-1')).toEqual(['editors'])
    expect((await repository.listGroups()).find((item) => item.key === 'editors')?.members).toBe(1)
  })

  test('manages custom groups and page rules without leaking driver errors', async () => {
    const db = create()
    databases.push(db)
    const repository = createSqliteAuthzRepository(db)
    await repository.insertGroup(group('group-docs', 'docs'))
    await expect(repository.insertGroup(group('group-docs-2', 'docs'))).rejects.toBeInstanceOf(DuplicateAuthzGroupError)

    expect(await repository.addUserToGroup('user-1', 'missing', 20)).toBeNull()
    expect(await repository.addUserToGroup('user-1', 'docs', 20)).toBe('docs')
    expect(await repository.addUserToGroup('user-1', 'docs', 21)).toBe('docs')
    expect(await repository.groupsForUser('user-1')).toEqual(['docs'])
    expect(await repository.removeUserFromGroup('user-1', 'docs')).toBe('docs')
    expect(await repository.groupsForUser('user-1')).toEqual([])

    const rule: PageRuleRecord = {
      id: 'rule-1',
      subjectType: 'anonymous',
      subjectId: null,
      action: 'page:read',
      effect: 'deny',
      matcher: 'prefix',
      pattern: 'private',
      createdAt: 30,
    }
    await repository.insertPageRule(rule)
    expect(await repository.listPageRules()).toEqual([rule])
    await repository.deletePageRule(rule.id)
    expect(await repository.listPageRules()).toEqual([])
  })
})
