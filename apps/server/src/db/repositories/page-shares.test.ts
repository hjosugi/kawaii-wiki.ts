import { afterEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import { pages } from '../schema.ts'
import {
  DuplicatePageShareTokenError,
  type PageShareRecord,
} from '../../repositories/page-shares.ts'
import type { PageRecord } from '../../repositories/pages.ts'
import { createSqlitePageShareRepository } from './page-shares.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

const page: PageRecord = {
  id: 'page-1',
  path: 'docs/shared',
  title: 'Shared',
  description: '',
  icon: '',
  coverUrl: '',
  coverPosition: 'center',
  content: 'hello',
  renderedHtml: '<p>hello</p>',
  toc: '[]',
  contentType: 'markdown',
  lifecycle: 'active',
  status: 'verified',
  labels: '[]',
  ownerId: null,
  reviewAt: null,
  publishAt: null,
  navOrder: null,
  pinned: false,
  spaceKey: 'docs',
  locale: 'en',
  authorId: 'user-1',
  createdAt: 10,
  updatedAt: 10,
}

const share = (overrides: Partial<PageShareRecord> = {}): PageShareRecord => ({
  token: 'token-1',
  path: page.path,
  createdBy: 'user-1',
  expiresAt: null,
  revokedAt: null,
  createdAt: 20,
  ...overrides,
})

describe.each(drivers)('%s page-share repository contract', (_driver, create) => {
  test('finds active pages and active shares without returning expired links', async () => {
    const db = create()
    databases.push(db)
    db.insert(pages).values(page).run()
    const repository = createSqlitePageShareRepository(db)

    expect(await repository.findActivePage(page.path)).toEqual(page)
    await repository.insert(share({ token: 'expired', expiresAt: 30 }))
    await repository.insert(share({ token: 'active', expiresAt: 50, createdAt: 21 }))
    expect(await repository.findActiveForPath(page.path, 30)).toMatchObject({ token: 'active' })
    expect(await repository.findByToken('expired')).toMatchObject({ expiresAt: 30 })

    db.update(pages).set({ lifecycle: 'archived' }).where(eq(pages.id, page.id)).run()
    expect(await repository.findActivePage(page.path)).toBeUndefined()
  })

  test('normalizes duplicate tokens and revokes idempotently', async () => {
    const db = create()
    databases.push(db)
    const repository = createSqlitePageShareRepository(db)
    await repository.insert(share())
    await expect(repository.insert(share({ path: 'other' }))).rejects.toBeInstanceOf(DuplicatePageShareTokenError)

    expect(await repository.revoke('missing', 30)).toBeUndefined()
    expect(await repository.revoke('token-1', 30)).toMatchObject({ revokedAt: 30 })
    expect(await repository.revoke('token-1', 40)).toMatchObject({ revokedAt: 30 })
    expect(await repository.findActiveForPath(page.path, 20)).toBeUndefined()
  })
})
