import { afterEach, describe, expect, test } from 'bun:test'
import type { DB } from '../client.ts'
import { createLibsqlDb, createSqliteDb } from '../client.ts'
import { pages, users } from '../schema.ts'
import type { CommentRecord } from '../../repositories/comments.ts'
import { createSqliteCommentRepository } from './comments.ts'

const databases: DB[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.$client.close()
})

const drivers = [
  ['sqlite', () => createSqliteDb(':memory:')],
  ['libsql', () => createLibsqlDb({ driver: 'libsql', url: ':memory:', authToken: null, replicaPath: null })],
] as const

const comment: CommentRecord = {
  id: 'comment-1',
  pageId: 'page-1',
  path: 'docs/comments',
  body: 'Hello',
  authorId: 'user-1',
  resolvedAt: null,
  createdAt: 10,
  updatedAt: 10,
}

const seedContext = (db: DB): void => {
  db.insert(users).values({
    id: 'user-1', email: 'author@example.com', name: 'Author', passwordHash: 'hash', role: 'editor',
    totpSecret: null, totpEnabled: 0, disabledAt: null, tokenInvalidBefore: 0, emailVerifiedAt: 1,
    profileBio: '', profileCoverUrl: '', profileLinks: '[]', profileFavoritePages: '[]', createdAt: 1,
  }).run()
  db.insert(pages).values({
    id: 'page-1', path: 'docs/comments', title: 'Comments', description: '', icon: '', coverUrl: '', coverPosition: 'center',
    content: '', renderedHtml: '', toc: '[]', contentType: 'markdown', lifecycle: 'active', status: 'verified',
    labels: '["kawaii-wiki-comments-open"]', ownerId: null, reviewAt: null, publishAt: null, navOrder: null,
    pinned: false, spaceKey: 'docs', locale: 'en', authorId: 'user-1', createdAt: 1, updatedAt: 1,
  }).run()
}

describe.each(drivers)('%s comment repository contract', (_driver, create) => {
  test('loads active page context and comments with ordered author joins', async () => {
    const db = create()
    databases.push(db)
    seedContext(db)
    const repository = createSqliteCommentRepository(db)

    expect(await repository.findActivePage('docs/comments')).toEqual({
      id: 'page-1', path: 'docs/comments', labels: '["kawaii-wiki-comments-open"]',
    })
    expect(await repository.findAuthorName('user-1')).toBe('Author')
    expect(await repository.findAuthorName('missing')).toBeNull()
    await repository.insert(comment)
    await repository.insert({ ...comment, id: 'comment-2', authorId: null, createdAt: 20, updatedAt: 20 })
    expect(await repository.listByPageId('page-1')).toEqual([
      { comment, authorName: 'Author' },
      { comment: { ...comment, id: 'comment-2', authorId: null, createdAt: 20, updatedAt: 20 }, authorName: null },
    ])
  })

  test('updates, resolves, and deletes with mutation result reporting', async () => {
    const db = create()
    databases.push(db)
    seedContext(db)
    const repository = createSqliteCommentRepository(db)
    await repository.insert(comment)

    expect(await repository.updateBody('missing', 'No', 20)).toBe(false)
    expect(await repository.updateBody(comment.id, 'Updated', 20)).toBe(true)
    expect(await repository.findById(comment.id)).toMatchObject({ body: 'Updated', updatedAt: 20 })
    expect(await repository.resolve(comment.id, 30, 30)).toBe(true)
    expect(await repository.findById(comment.id)).toMatchObject({ resolvedAt: 30, updatedAt: 30 })
    expect(await repository.delete(comment.id)).toBe(true)
    expect(await repository.delete(comment.id)).toBe(false)
  })
})
