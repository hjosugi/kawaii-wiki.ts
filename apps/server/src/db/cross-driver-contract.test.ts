/**
 * Cross-driver service contract.
 *
 * Runs the same authorization, page, auth, automation, import/export, and
 * realtime behaviour through the composed service layer against every backing
 * driver. The two local drivers (bun:sqlite and an in-memory libSQL) always
 * run; when `KAWAII_WIKI_TEST_LIBSQL_URL` is set, an embedded replica against a
 * provisioned external libSQL primary is exercised under the exact same suite.
 *
 * This is the acceptance-level "full driver matrix" for #363: it proves the
 * driver-neutral contracts hold identically on SQLite, libSQL, and a remote SQL
 * database, not just at the individual repository boundary.
 *
 * Remote embedded replicas reflect a primary write only once the replica has
 * synced; local drivers are immediately consistent. `db.$syncAfterWrite` is the
 * production primitive that pulls those frames (and is `undefined` on local
 * drivers), so the helpers below reuse it to read a write back deterministically
 * on every driver rather than papering the difference over.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { asc } from 'drizzle-orm'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { can, parsePageFile, serializePageFile, type Principal } from '@kawaii-wiki/core'
import { createLibsqlDb, createSqliteDb, type DB } from './client.ts'
import { createServices } from './services.ts'
import { createDbEventBus, type WikiEvent } from '../realtime/bus.ts'
import { wikiEvents } from './schema.ts'

const admin: Principal = { id: 'contract-admin', role: 'admin' }

const externalUrl = process.env.KAWAII_WIKI_TEST_LIBSQL_URL?.trim()
const contractDir = mkdtempSync(join(process.cwd(), '.kawaii-wiki-full-contract-'))
let externalReplicaSequence = 0

const drivers: Array<readonly [string, () => DB]> = [
  ['sqlite', () => createSqliteDb(join(contractDir, 'sqlite.db'))],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: join(contractDir, 'libsql.db'), authToken: null, replicaPath: null })],
]
if (externalUrl) {
  drivers.push([
    'external-libsql',
    () => createLibsqlDb({
      driver: 'libsql',
      url: externalUrl,
      authToken: process.env.KAWAII_WIKI_TEST_LIBSQL_AUTH_TOKEN?.trim() || null,
      replicaPath: join(contractDir, `external-replica-${externalReplicaSequence += 1}.db`),
    }),
  ])
}

afterAll(() => {
  rmSync(contractDir, { recursive: true, force: true })
})

const eventually = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await Bun.sleep(25)
  }
  throw new Error('condition was not met in time')
}

const readStoredEventPaths = (db: DB): string[] => {
  const reader = db.$openReadReplica?.()
  try {
    return (reader ?? db)
      .select({ path: wikiEvents.path })
      .from(wikiEvents)
      .orderBy(asc(wikiEvents.id))
      .all()
      .map((row) => row.path)
  } finally {
    reader?.$client.close()
  }
}

describe.each(drivers)('%s cross-driver service contract', (driver, create) => {
  // A single database per driver, shared across the domains below. Each domain
  // namespaces its fixtures by `driver`, so the shared external primary never
  // sees a primary-key collision between domains.
  let db: DB
  let services: ReturnType<typeof createServices>

  // Pull the primary's latest frames into the embedded replica; no-op locally.
  const commit = async (): Promise<void> => {
    await db.$syncAfterWrite?.()
  }

  // Read back a value, syncing the replica between attempts until it appears.
  // Local drivers satisfy `ready` on the first read and never loop.
  const untilVisible = async <T>(read: () => Promise<T> | T, ready: (value: T) => boolean): Promise<T> => {
    let value = await read()
    for (let attempt = 0; !ready(value) && db.$syncAfterWrite && attempt < 10; attempt += 1) {
      await db.$syncAfterWrite()
      value = await read()
    }
    return value
  }

  beforeAll(async () => {
    db = create()
    services = createServices(db)
    await services.authz.ensureDefaults()
    // Make the default groups/grants visible before the first policy load.
    await commit()
  })

  afterAll(() => {
    db.$client.close()
  })

  test('health: the connectivity probe resolves', async () => {
    await expect(services.ping()).resolves.toBeUndefined()
  })

  test('authorization: default policy persists and page rules are enforced', async () => {
    const groups = await services.authz.listGroups(admin)
    expect(groups.ok).toBe(true)
    if (!groups.ok) throw new Error('list groups failed')
    expect(groups.value.map((group) => group.key)).toEqual(['admins', 'editors', 'guests', 'viewers'])
    expect(await services.authz.canAnonymous('page:read', `${driver}/public`)).toBe(true)
    expect(await services.authz.canAnonymous('page:create', `${driver}/public`)).toBe(false)

    const denied = await services.authz.createPageRule(admin, {
      subjectType: 'group',
      subjectId: 'viewers',
      action: 'page:read',
      effect: 'deny',
      matcher: 'prefix',
      pattern: `${driver}-secret`,
    })
    expect(denied.ok).toBe(true)
    if (!denied.ok) throw new Error('page rule create failed')
    // Sync before the invalidated policy is reloaded below.
    await commit()

    // Uncached read-back proves the rule persisted on this driver.
    const rules = await untilVisible(
      () => services.authz.listPageRules(admin),
      (result) => result.ok && result.value.some((rule) => rule.id === denied.value.id),
    )
    expect(rules.ok && rules.value.some((rule) => rule.id === denied.value.id)).toBe(true)

    const viewer = await services.users.create({
      email: `${driver}-viewer@example.com`,
      name: 'Viewer',
      password: 'password',
      role: 'viewer',
    })
    expect(viewer.ok).toBe(true)
    if (!viewer.ok) throw new Error('viewer seed failed')
    const principal = await services.authz.principalForUser(viewer.value)
    expect(can(principal, 'page:read', { path: `${driver}/open` })).toBe(true)
    expect(can(principal, 'page:read', { path: `${driver}-secret/closed` })).toBe(false)
  })

  test('page: create, read, update, and revision history', async () => {
    const path = `cross/${driver}/page`
    const created = await services.pages.create({ path, title: `Page ${driver}`, content: `original ${driver}` }, admin)
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error(`page create failed: ${created.error.message}`)

    const fetched = await services.pages.getByPath(path)
    expect(fetched.ok).toBe(true)
    if (fetched.ok) expect(fetched.value.content).toBe(`original ${driver}`)

    const updated = await services.pages.update(path, { content: `updated ${driver}` }, admin)
    expect(updated.ok).toBe(true)
    if (updated.ok) expect(updated.value.content).toBe(`updated ${driver}`)

    const history = await services.pages.history(path)
    expect(history.ok).toBe(true)
    if (history.ok) expect(history.value.length).toBeGreaterThanOrEqual(2)
  })

  test('auth: user persistence, duplicate rejection, and token invalidation', async () => {
    const email = `${driver}-auth@example.com`
    const created = await services.users.create({ email, name: 'Auth User', password: 'old-password', role: 'editor' })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('auth user seed failed')
    await commit()

    const found = await untilVisible(() => services.users.findByEmail(email), (user) => Boolean(user))
    expect(found).toMatchObject({ id: created.value.id, email })

    const duplicate = await services.users.create({ email, name: 'Duplicate', password: 'password', role: 'viewer' })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.error.kind).toBe('conflict')

    const principal: Principal = { id: created.value.id, role: 'editor' }
    const wrong = await services.users.changePassword(principal, { currentPassword: 'nope', newPassword: 'new-password' })
    expect(wrong.ok).toBe(false)
    const changed = await services.users.changePassword(principal, { currentPassword: 'old-password', newPassword: 'new-password' })
    expect(changed.ok).toBe(true)
    if (changed.ok) expect(changed.value.tokenInvalidBefore).toBeGreaterThan(0)
  })

  test('automation: rule persistence and retrieval', async () => {
    const created = await services.webhooks.createAutomationRule(admin, {
      name: `Auto ${driver}`,
      type: 'event-rule',
      config: { trigger: 'page.updated', actions: { addLabel: `${driver}-reviewed` } },
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error(`automation create failed: ${created.error.message}`)
    await commit()

    const rules = await untilVisible(
      () => services.webhooks.listAutomationRules(admin),
      (result) => result.ok && result.value.some((rule) => rule.id === created.value.id),
    )
    expect(rules.ok).toBe(true)
    if (!rules.ok) throw new Error('automation list failed')
    const persisted = rules.value.find((rule) => rule.id === created.value.id)
    expect(persisted).toBeDefined()
    expect(persisted?.config).toMatchObject({ trigger: 'page.updated', actions: { addLabel: `${driver}-reviewed` } })
  })

  test('import/export: markdown round-trip through the page service', async () => {
    const path = `cross/${driver}/import`
    const source = serializePageFile({ title: `Imported ${driver}`, description: 'imported doc', content: `import body ${driver}` })

    const imported = await services.pages.upsertFromFile(path, parsePageFile(source), {}, admin)
    expect(imported.ok).toBe(true)
    if (!imported.ok) throw new Error(`import failed: ${imported.error.message}`)
    expect(imported.value.created).toBe(true)

    const exported = await untilVisible(
      async () => (await services.pages.allActive()).find((page) => page.path === path),
      (page) => Boolean(page),
    )
    expect(exported).toBeDefined()
    expect(exported?.title).toBe(`Imported ${driver}`)
    expect(exported?.content).toContain(`import body ${driver}`)
  })

  test('realtime: event bus persists, polls, and prunes across instances', async () => {
    const peerDb = create()
    const busA = createDbEventBus(db, {
      sourceId: `${driver}-a`,
      pollIntervalMs: 10,
      maxStoredEvents: 3,
    })
    const busB = createDbEventBus(peerDb, {
      sourceId: `${driver}-b`,
      pollIntervalMs: 10,
      maxStoredEvents: 3,
    })
    try {
      const seenA: WikiEvent[] = []
      const seenB: WikiEvent[] = []
      busA.subscribe((event) => seenA.push(event))
      busB.subscribe((event) => seenB.push(event))

      const fromA: WikiEvent = { type: 'page:changed', action: 'created', path: `${driver}/from-a` }
      busA.emit(fromA)
      expect(seenA).toEqual([fromA])
      await eventually(() => seenB.length === 1)
      expect(seenB).toEqual([fromA])

      const fromB: WikiEvent = { type: 'page:changed', action: 'moved', path: `${driver}/from-b`, from: fromA.path }
      busB.emit(fromB)
      expect(seenB.at(-1)).toEqual(fromB)
      await eventually(() => seenA.length === 2)
      expect(seenA.at(-1)).toEqual(fromB)

      for (let index = 0; index < 5; index += 1) {
        busA.emit({ type: 'page:changed', action: 'updated', path: `${driver}/prune-${index}` })
      }
      await eventually(() =>
        readStoredEventPaths(db).join(',') === [2, 3, 4].map((index) => `${driver}/prune-${index}`).join(','),
      )

      await Bun.sleep(75)
      expect(seenA.filter((event) => event.path === fromA.path)).toHaveLength(1)
      expect(seenB.filter((event) => event.path === fromB.path)).toHaveLength(1)
    } finally {
      busA.close()
      busB.close()
      peerDb.$client.close()
    }
  })
})
