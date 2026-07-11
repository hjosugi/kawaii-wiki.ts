import { afterEach, describe, expect, test } from 'bun:test'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import type { LinkPreviewRecord } from '../../repositories/link-previews.ts'
import { createSqliteLinkPreviewRepository } from './link-previews.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

const preview = (overrides: Partial<LinkPreviewRecord> = {}): LinkPreviewRecord => ({
  url: 'https://example.com/page',
  kind: 'unfurl',
  provider: 'example.com',
  title: 'Example',
  description: 'Description',
  image: null,
  author: null,
  siteName: 'Example',
  contentType: 'text/html',
  data: '{}',
  fetchedAt: 10,
  expiresAt: 20,
  ...overrides,
})

describe.each(drivers)('%s link-preview repository contract', (_driver, create) => {
  test('finds and fully replaces cached preview data by URL', async () => {
    const db = create()
    databases.push(db)
    const repository = createSqliteLinkPreviewRepository(db)

    expect(await repository.findByUrl('missing')).toBeUndefined()
    await repository.upsert(preview())
    expect(await repository.findByUrl(preview().url)).toEqual(preview())

    const replacement = preview({
      kind: 'youtube-latest',
      provider: 'youtube',
      title: 'Latest',
      description: '',
      image: 'https://example.com/thumb.jpg',
      author: 'Channel',
      siteName: 'YouTube',
      contentType: 'application/atom+xml',
      data: '{"videos":[]}',
      fetchedAt: 30,
      expiresAt: 40,
    })
    await repository.upsert(replacement)
    expect(await repository.findByUrl(preview().url)).toEqual(replacement)
  })
})
