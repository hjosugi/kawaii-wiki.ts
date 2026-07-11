import { afterEach, describe, expect, test } from 'bun:test'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import { createSqliteSettingsRepository } from './settings.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

describe.each(drivers)('%s settings repository contract', (_driver, create) => {
  test('lists and atomically upserts complete setting batches', async () => {
    const db = create()
    databases.push(db)
    const repository = createSqliteSettingsRepository(db)

    expect(await repository.list()).toEqual([])
    await repository.upsertAll([
      { key: 'siteTitle', value: 'First', updatedAt: 10 },
      { key: 'theme', value: 'dark', updatedAt: 10 },
    ])
    expect((await repository.list()).sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: 'siteTitle', value: 'First', updatedAt: 10 },
      { key: 'theme', value: 'dark', updatedAt: 10 },
    ])

    await repository.upsertAll([
      { key: 'siteTitle', value: 'Updated', updatedAt: 20 },
      { key: 'homePath', value: 'docs/home', updatedAt: 20 },
    ])
    expect((await repository.list()).sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: 'homePath', value: 'docs/home', updatedAt: 20 },
      { key: 'siteTitle', value: 'Updated', updatedAt: 20 },
      { key: 'theme', value: 'dark', updatedAt: 10 },
    ])
  })
})
