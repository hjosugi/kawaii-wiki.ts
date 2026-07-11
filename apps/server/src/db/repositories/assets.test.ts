import { afterEach, describe, expect, test } from 'bun:test'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import { assets, pages } from '../schema.ts'
import type { AssetRecord } from '../../repositories/assets.ts'
import { createSqliteAssetRepository } from './assets.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

const asset = (id: string, createdAt: number, deletedAt: number | null = null): AssetRecord => ({
  id,
  filename: `${id}.png`,
  storageName: `uploads/${id}.png`,
  folder: id === 'active-b' ? 'art' : '',
  mime: 'image/png',
  size: createdAt,
  authorId: null,
  createdAt,
  deletedAt,
})

const seedPage = (db: DB, id: string, lifecycle: 'active' | 'archived'): void => {
  db.insert(pages).values({
    id, path: `docs/${id}`, title: id, description: '', icon: '', coverUrl: '', coverPosition: 'center',
    content: `![asset](/assets/uploads/active-a.png)`, renderedHtml: '', toc: '[]', contentType: 'markdown',
    lifecycle, status: 'verified', labels: '[]', ownerId: null, reviewAt: null, publishAt: null,
    navOrder: null, pinned: false, spaceKey: 'docs', locale: 'ja', authorId: null, createdAt: 1, updatedAt: 1,
  }).run()
}

describe.each(drivers)('%s asset repository contract', (_driver, create) => {
  test('lists, filters, finds, updates, and deletes asset metadata asynchronously', async () => {
    const db = create()
    databases.push(db)
    const repository = createSqliteAssetRepository(db)

    await repository.insert(asset('active-a', 10))
    await repository.insert(asset('active-b', 20))
    await repository.insert(asset('deleted', 30, 40))

    expect((await repository.listActive()).map((row) => row.id)).toEqual(['active-b', 'active-a'])
    expect((await repository.listActive('art')).map((row) => row.id)).toEqual(['active-b'])
    expect((await repository.listDeleted()).map((row) => row.id)).toEqual(['deleted'])
    expect(await repository.findActive('active-a')).toMatchObject({ filename: 'active-a.png' })
    expect(await repository.findActive('deleted')).toBeUndefined()
    expect(await repository.findDeleted('deleted')).toMatchObject({ deletedAt: 40 })

    await repository.update('active-a', { filename: 'renamed.png', folder: 'docs', deletedAt: 50 })
    expect(await repository.findDeleted('active-a')).toMatchObject({ filename: 'renamed.png', folder: 'docs', deletedAt: 50 })
    await repository.delete('active-a')
    expect(await repository.findDeleted('active-a')).toBeUndefined()
  })

  test('tracks active-page references and asset access paths', async () => {
    const db = create()
    databases.push(db)
    seedPage(db, 'active-page', 'active')
    seedPage(db, 'archived-page', 'archived')
    db.insert(assets).values(asset('active-a', 10)).run()
    const repository = createSqliteAssetRepository(db)

    expect((await repository.listActivePages()).map((row) => row.id)).toEqual(['active-page'])
    await repository.insertReferences(['active-page', 'archived-page'], 'active-a')
    await repository.insertReferences(['active-page'], 'active-a')
    expect(await repository.listReferences(['active-page'])).toEqual([{ pageId: 'active-page', assetId: 'active-a' }])
    expect((await repository.listAffectedPageIds('active-a')).sort()).toEqual(['active-page', 'archived-page'])
    expect(await repository.listAccessPaths('uploads/active-a.png')).toEqual(['docs/active-page'])
    expect(await repository.listReferences([])).toEqual([])
    expect(await repository.listAccessPaths('missing.png')).toEqual([])
  })
})
