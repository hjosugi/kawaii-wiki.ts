import { afterEach, describe, expect, test } from 'bun:test'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import { pages, users } from '../schema.ts'
import type { NotificationRecord } from '../../repositories/notifications.ts'
import { createSqliteNotificationRepository } from './notifications.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

const notification = (id: string, createdAt: number): NotificationRecord => ({
  id,
  userId: 'user-1',
  kind: 'page',
  path: 'docs/new',
  message: 'Changed',
  payload: '{}',
  readAt: null,
  createdAt,
})

describe.each(drivers)('%s notification repository contract', (_driver, create) => {
  test('stores, orders, limits, and marks notifications read per user', async () => {
    const db = create()
    databases.push(db)
    const repository = createSqliteNotificationRepository(db)
    await repository.insert(notification('n-1', 10))
    await repository.insert(notification('n-2', 20))

    expect((await repository.listByUser('user-1', 1)).map((row) => row.id)).toEqual(['n-2'])
    await repository.markRead('user-1', 'n-2', 30)
    expect(await repository.listByUser('user-1', 10)).toContainEqual(expect.objectContaining({ id: 'n-2', readAt: 30 }))
    await repository.markRead('user-1', undefined, 40)
    expect((await repository.listByUser('user-1', 10)).every((row) => row.readAt === 40)).toBe(true)
  })

  test('looks up notification context and atomically merges page watchers', async () => {
    const db = create()
    databases.push(db)
    db.insert(users).values({
      id: 'user-1', email: 'watcher@example.com', name: 'Watcher', passwordHash: 'hash', role: 'editor',
      totpSecret: null, totpEnabled: 0, disabledAt: null, tokenInvalidBefore: 0, emailVerifiedAt: 1,
      profileBio: '', profileCoverUrl: '', profileLinks: '[]', profileFavoritePages: '[]', createdAt: 1,
    }).run()
    db.insert(pages).values({
      id: 'page-1', path: 'docs/new', title: 'New', description: '', icon: '', coverUrl: '', coverPosition: 'center',
      content: '', renderedHtml: '', toc: '[]', contentType: 'markdown', lifecycle: 'active', status: 'verified',
      labels: '[]', ownerId: 'user-1', reviewAt: null, publishAt: null, navOrder: null, pinned: false,
      spaceKey: 'docs', locale: 'en', authorId: 'user-1', createdAt: 1, updatedAt: 1,
    }).run()
    const repository = createSqliteNotificationRepository(db)

    expect(await repository.findPage('docs/new')).toMatchObject({ title: 'New', ownerId: 'user-1' })
    expect(await repository.listUsers()).toEqual([{ id: 'user-1', email: 'watcher@example.com', name: 'Watcher' }])
    await repository.setWatching('user-1', 'docs/old', true, 10)
    await repository.setWatching('user-1', 'docs/new', true, 11)
    await repository.moveWatchers('docs/old', 'docs/new')
    expect(await repository.isWatching('user-1', 'docs/old')).toBe(false)
    expect(await repository.listWatchers('docs/new')).toHaveLength(1)
    await repository.deleteWatchers('docs/new')
    expect(await repository.isWatching('user-1', 'docs/new')).toBe(false)
  })
})
