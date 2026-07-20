/**
 * MySQL end-to-end app boot — integration. Env-gated.
 *
 * The acceptance proof for #365: the full HTTP app, wired through
 * `createMysqlDatabaseAdapter`, serves real requests against MySQL — health, the
 * setup gate, first-user registration, and a page create/read round-trip.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../http/app.ts'
import { createMysqlDatabaseAdapter } from '../../http/mysql-adapter.ts'
import { testEnv } from '../../http/test-support.ts'
import type { StructuredLogger } from '../../observability/logging.ts'
import { createMysqlContractDb, testMysqlUrl, type MysqlContractDb } from './test-support.ts'

const noopLogger: StructuredLogger = { info: () => {}, warn: () => {}, error: () => {} }

const post = (path: string, body: unknown, token?: string): Request =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })

describe.skipIf(!testMysqlUrl)('mysql app boot', () => {
  let harness: MysqlContractDb
  let dataDir: string
  beforeAll(async () => { harness = await createMysqlContractDb('kw_mysql_app_boot') }, 30_000)
  beforeEach(async () => {
    await harness.reset()
    dataDir = mkdtempSync(join(tmpdir(), 'kw-mysql-app-'))
    mkdirSync(join(dataDir, 'assets'), { recursive: true })
  }, 30_000)
  afterEach(() => { rmSync(dataDir, { recursive: true, force: true }) })
  afterAll(async () => { await harness?.close() }, 30_000)

  test('serves health, the setup gate, and a full page lifecycle over MySQL', async () => {
    const app = createApp({
      database: createMysqlDatabaseAdapter(harness.client),
      env: testEnv(dataDir),
      logger: noopLogger,
    })

    // Health probe reaches MySQL.
    const health = await app.handle(new Request('http://localhost/api/health'))
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ ok: true })

    // Fresh schema → setup required.
    const before = await app.handle(new Request('http://localhost/api/setup/status'))
    expect(await before.json()).toEqual({ needsSetup: true })

    // First registration bootstraps the admin.
    const registered = await app.handle(post('/api/auth/register', { email: 'admin@example.com', name: 'Admin', password: 'password' }))
    expect(registered.status).toBe(200)
    const { token, user } = await registered.json() as { token: string; user: { role: string } }
    expect(user.role).toBe('admin')

    // Setup gate closes once the admin exists.
    const after = await app.handle(new Request('http://localhost/api/setup/status'))
    expect(await after.json()).toEqual({ needsSetup: false })

    // Create a page and read it back through the service layer.
    const created = await app.handle(post('/api/pages', { path: 'docs/mysql', title: 'MySQL', content: 'hello from mysql', status: 'verified' }, token))
    expect(created.status).toBe(200)

    const read = await app.handle(new Request('http://localhost/api/page?path=docs/mysql', {
      headers: { authorization: `Bearer ${token}` },
    }))
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ page: { content: 'hello from mysql' } })
  })
})
