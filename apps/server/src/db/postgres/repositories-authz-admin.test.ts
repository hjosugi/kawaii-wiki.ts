/**
 * PostgreSQL authz / admin / page-read repository contract tests — integration.
 * Runs only when KAWAII_WIKI_TEST_POSTGRES_URL is set; own isolated schema.
 * Revisions use distinct createdAt so ordering is deterministic without a
 * SQLite rowid tie-breaker.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { auditLog, groupMemberships, groups, pageRedirects, pageRevisions, pages, users } from './schema.ts'
import { createPostgresContractDb, testPostgresUrl, type PostgresContractDb } from './test-support.ts'
import { createPostgresAuthzRepository } from './repositories/authz.ts'
import { createPostgresAdminRepository } from './repositories/admin.ts'
import { createPostgresPageReadRepository } from './repositories/pages.ts'
import { DuplicateAuthzGroupError, type PermissionGrantRecord } from '../../repositories/authz.ts'

describe.skipIf(!testPostgresUrl)('postgres authz/admin/page-read contracts', () => {
  let harness: PostgresContractDb
  const seedUser = (id: string, over: Record<string, unknown> = {}) =>
    harness.db.insert(users).values({ id, email: `${id}@x`, name: id.toUpperCase(), passwordHash: 'h', createdAt: 1, ...over })
  const seedGroup = (id: string, key: string) =>
    harness.db.insert(groups).values({ id, key, name: key, description: '', createdAt: 1 })
  const seedPage = (id: string, path: string, over: Record<string, unknown> = {}) =>
    harness.db.insert(pages).values({ id, path, title: path, createdAt: 1, updatedAt: 1, ...over })
  const seedRevision = (id: string, pageId: string, over: Record<string, unknown> = {}) =>
    harness.db.insert(pageRevisions).values({ id, pageId, path: 'docs/a', title: 'T', action: 'updated', createdAt: 1, ...over })

  beforeAll(async () => { harness = await createPostgresContractDb('kw_authz_contract') })
  beforeEach(async () => { await harness.reset() })
  afterAll(async () => { await harness?.close() })

  test('authz: ensureDefaults is idempotent; grants and page rules', async () => {
    const repo = createPostgresAuthzRepository(harness.db)
    const group = { id: 'g1', key: 'everyone', name: 'Everyone', description: '', createdAt: 1 }
    const grants: PermissionGrantRecord[] = [
      { id: 'pg1', subjectType: 'anonymous', subjectId: null, action: 'page:read', effect: 'allow', createdAt: 1 },
      { id: 'pg2', subjectType: 'group', subjectId: 'everyone', action: 'page:read', effect: 'allow', createdAt: 1 },
    ]
    await repo.ensureDefaults([group], grants)
    await repo.ensureDefaults([{ ...group, id: 'other' }], grants) // idempotent: same key + same grants
    expect((await repo.listGroups()).map((g) => g.key)).toEqual(['everyone'])
    expect((await repo.listPermissionGrants()).length).toBe(2)

    await repo.insertPageRule({ id: 'r1', subjectType: 'anonymous', subjectId: null, action: 'page:read', effect: 'deny', matcher: 'prefix', pattern: 'secret/', createdAt: 2 })
    await repo.insertPageRule({ id: 'r2', subjectType: 'group', subjectId: 'everyone', action: 'page:read', effect: 'allow', matcher: 'exact', pattern: 'a', createdAt: 1 })
    expect((await repo.listPageRules()).map((r) => r.id)).toEqual(['r2', 'r1']) // asc createdAt
    await repo.deletePageRule('r1')
    expect((await repo.listPageRules()).map((r) => r.id)).toEqual(['r2'])
  })

  test('authz: groups, membership, and duplicate-key guard', async () => {
    const repo = createPostgresAuthzRepository(harness.db)
    await repo.insertGroup({ id: 'g1', key: 'editors', name: 'Editors', description: 'd', createdAt: 1 })
    await expect(repo.insertGroup({ id: 'g2', key: 'editors', name: 'Dup', description: '', createdAt: 2 })).rejects.toThrow(DuplicateAuthzGroupError)
    expect((await repo.findGroup('editors'))?.name).toBe('Editors')

    expect(await repo.addUserToGroup('u1', 'missing', 1)).toBeNull()
    expect(await repo.addUserToGroup('u1', 'editors', 1)).toBe('editors')
    expect(await repo.addUserToGroup('u1', 'editors', 2)).toBe('editors') // idempotent
    expect(await repo.groupsForUser('u1')).toEqual(['editors'])
    expect((await repo.listGroups()).find((g) => g.key === 'editors')?.members).toBe(1)

    expect(await repo.removeUserFromGroup('u1', 'editors')).toBe('editors')
    expect(await repo.groupsForUser('u1')).toEqual([])
  })

  test('authz: syncRoleGroup moves the user between role groups', async () => {
    const repo = createPostgresAuthzRepository(harness.db)
    const keys = ['role-admin', 'role-editor', 'role-viewer']
    for (const [i, key] of keys.entries()) await seedGroup(`rg${i}`, key)

    await repo.addUserToGroup('u1', 'role-editor', 1)
    await repo.syncRoleGroup('u1', 'role-admin', keys, 2)
    expect(await repo.groupsForUser('u1')).toEqual(['role-admin'])
    await repo.syncRoleGroup('u1', 'role-viewer', keys, 3)
    expect(await repo.groupsForUser('u1')).toEqual(['role-viewer'])
  })

  test('admin: stats and history stats', async () => {
    await seedUser('u1')
    await seedPage('p1', 'docs/a')
    await seedRevision('rev1', 'p1', { title: 'ab', description: 'cde', content: 'fghi' })
    const repo = createPostgresAdminRepository(harness.db)
    expect(await repo.stats()).toEqual({ users: 1, pages: 1, revisions: 1 })
    expect(await repo.historyStats()).toEqual({ revisions: 1, historyBytes: 9 }) // 2+3+4
  })

  test('admin: listPages with filters, author join, and pagination', async () => {
    await seedUser('u1', { name: 'Alice' })
    await seedPage('p1', 'docs/a', { authorId: 'u1', status: 'draft', updatedAt: 30, labels: 'x,news' })
    await seedPage('p2', 'docs/b', { authorId: 'u1', status: 'verified', updatedAt: 20 })
    await seedPage('p3', 'docs/c', { status: 'draft', updatedAt: 10 })
    await seedPage('p4', 'docs/d', { lifecycle: 'archived', status: 'draft', updatedAt: 40 }) // excluded

    const repo = createPostgresAdminRepository(harness.db)
    const all = await repo.listPages({ limit: 10, offset: 0 })
    expect(all.total).toBe(3)
    expect(all.rows.map((r) => r.path)).toEqual(['docs/a', 'docs/b', 'docs/c']) // updatedAt desc
    expect(all.rows[0]?.authorName).toBe('Alice')

    expect((await repo.listPages({ limit: 10, offset: 0, status: 'draft' })).rows.map((r) => r.path)).toEqual(['docs/a', 'docs/c'])
    expect((await repo.listPages({ limit: 10, offset: 0, label: 'news' })).rows.map((r) => r.path)).toEqual(['docs/a'])
    expect((await repo.listPages({ limit: 1, offset: 1 })).rows.map((r) => r.path)).toEqual(['docs/b'])
  })

  test('admin: listAudit with filters and pagination', async () => {
    await harness.db.insert(auditLog).values([
      { action: 'page.create', userId: 'u1', path: 'a', data: '{}', createdAt: 10 },
      { action: 'page.delete', userId: 'u2', path: 'b', data: '{}', createdAt: 20 },
      { action: 'user.login', userId: 'u1', path: null, data: '{}', createdAt: 30 },
    ])
    const repo = createPostgresAdminRepository(harness.db)
    const all = await repo.listAudit({ limit: 10, offset: 0 })
    expect(all.total).toBe(3)
    expect(all.rows.map((r) => r.action)).toEqual(['user.login', 'page.delete', 'page.create']) // desc createdAt

    expect((await repo.listAudit({ limit: 10, offset: 0, userId: 'u1' })).rows.map((r) => r.action)).toEqual(['user.login', 'page.create'])
    expect((await repo.listAudit({ limit: 10, offset: 0, action: 'page' })).total).toBe(2)
    expect((await repo.listAudit({ limit: 10, offset: 0, from: 15, to: 25 })).rows.map((r) => r.action)).toEqual(['page.delete'])
  })

  test('admin: users, memberships, role/password/deactivate', async () => {
    await seedUser('u1', { name: 'Admin', role: 'admin', createdAt: 1 })
    await seedUser('u2', { name: 'Editor', role: 'editor', createdAt: 2 })
    await seedGroup('g1', 'editors')
    await harness.db.insert(groupMemberships).values({ id: 'm1', userId: 'u2', groupId: 'g1', createdAt: 1 })
    const repo = createPostgresAdminRepository(harness.db)

    expect((await repo.listUsers()).map((u) => u.id)).toEqual(['u1', 'u2']) // asc createdAt
    expect((await repo.findUser('u1'))?.role).toBe('admin')
    expect(await repo.listGroupMemberships()).toEqual([{ userId: 'u2', key: 'editors' }])
    expect(await repo.activeAdminCount()).toBe(1)

    await repo.updateUserRole('u2', 'admin')
    expect(await repo.activeAdminCount()).toBe(2)
    await repo.deactivateUser('u1', 99)
    expect(await repo.activeAdminCount()).toBe(1)
    expect((await repo.findUser('u1'))?.disabledAt).toBe(99)
    await repo.updateUserPassword('u2', 'newhash', 50)
    expect((await repo.findUser('u2'))?.passwordHash).toBe('newhash')
  })

  test('admin: revision candidates and deletion', async () => {
    await seedPage('p1', 'docs/a')
    await seedRevision('rev1', 'p1', { createdAt: 10 })
    await seedRevision('rev2', 'p1', { createdAt: 30 })
    await seedRevision('rev3', 'p1', { createdAt: 20 })
    const repo = createPostgresAdminRepository(harness.db)
    expect((await repo.listRevisionCandidates()).map((r) => r.id)).toEqual(['rev2', 'rev3', 'rev1']) // desc createdAt
    await repo.deleteRevisions(['rev1', 'rev3'])
    expect((await repo.listRevisionCandidates()).map((r) => r.id)).toEqual(['rev2'])
  })

  test('page reads: active/inactive listings and redirects', async () => {
    await seedPage('p1', 'docs/a', { lifecycle: 'active', updatedAt: 10 })
    await seedPage('p2', 'docs/b', { lifecycle: 'archived', updatedAt: 30 })
    await seedPage('p3', 'docs/c', { lifecycle: 'deleted', updatedAt: 20 })
    await harness.db.insert(pageRedirects).values([
      { fromPath: 'old/b', toPath: 'docs/a', createdAt: 1 },
      { fromPath: 'old/a', toPath: 'docs/a', createdAt: 1 },
    ])
    const repo = createPostgresPageReadRepository(harness.db)
    expect((await repo.listActive()).map((p) => p.id)).toEqual(['p1'])
    expect((await repo.listInactive()).map((p) => p.id)).toEqual(['p2', 'p3']) // desc updatedAt
    expect((await repo.listRedirects()).map((r) => r.fromPath)).toEqual(['old/a', 'old/b']) // asc fromPath
  })

  test('page reads: recent revisions, per-page revisions, and contributors', async () => {
    await seedUser('u1', { name: 'Alice' })
    await seedPage('p1', 'docs/a')
    await seedRevision('rev1', 'p1', { authorId: 'u1', createdAt: 10 })
    await seedRevision('rev2', 'p1', { authorId: 'u1', createdAt: 30 })
    await seedRevision('rev3', 'p1', { authorId: null, createdAt: 20 })
    const repo = createPostgresPageReadRepository(harness.db)

    expect((await repo.listRecentRevisions(null, 10)).map((r) => r.id)).toEqual(['rev2', 'rev3', 'rev1'])
    expect((await repo.listRecentRevisions(25, 10)).map((r) => r.id)).toEqual(['rev3', 'rev1']) // before 25
    const withAuthor = (await repo.listRecentRevisions(null, 10)).find((r) => r.id === 'rev1')
    expect(withAuthor?.authorName).toBe('Alice')

    expect((await repo.listRevisions('p1')).map((r) => r.id)).toEqual(['rev2', 'rev3', 'rev1'])

    const contributors = await repo.revisionContributors('p1')
    const alice = contributors.find((c) => c.authorId === 'u1')
    expect(alice?.revisions).toBe(2)
    expect(alice?.lastContributionAt).toBe(30)
    expect(alice?.authorName).toBe('Alice')
    expect(contributors.find((c) => c.authorId === null)?.revisions).toBe(1)
  })
})
