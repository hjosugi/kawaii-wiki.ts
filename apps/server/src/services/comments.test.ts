import { describe, expect, test } from 'bun:test'
import type { Principal } from '@kawaii-wiki/core'
import { createDb } from '../db/client.ts'
import { createServices } from './index.ts'
import { createCommentService } from './comments.ts'
import type { SearchIndexer } from './search.ts'

const admin: Principal = { id: 'admin-1', role: 'admin' }

const fakeIndexer = (indexed: string[]): SearchIndexer => ({
  indexPageById: (pageId) => indexed.push(pageId),
  removePage: () => {},
  search: () => {
    throw new Error('not used')
  },
  rebuild: () => {},
  status: () => {
    throw new Error('not used')
  },
})

describe('comment service', () => {
  test('extracts mentions, joins author names, and refreshes the search index on mutations', async () => {
    const db = createDb(':memory:')
    const services = createServices(db)
    const user = await services.users.create({
      email: 'comments@example.com',
      name: 'Commenter',
      password: 'password',
      role: 'editor',
    })
    if (!user.ok) throw new Error('user seed failed')
    const principal: Principal = { id: user.value.id, role: user.value.role }
    const page = services.pages.create({ path: 'docs/comments', title: 'Comments', content: 'Body' }, admin)
    if (!page.ok) throw new Error('page seed failed')
    const indexed: string[] = []
    const comments = createCommentService(db, fakeIndexer(indexed))

    const created = comments.create('docs/comments', 'Hi @Alice, @alice, and @bob', principal)
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('comment create failed')
    expect(created.value.authorName).toBe('Commenter')
    expect(created.value.mentions).toEqual(['alice', 'bob'])
    expect(indexed).toEqual([page.value.id])

    const listed = comments.list('docs/comments')
    expect(listed.ok).toBe(true)
    if (listed.ok) expect(listed.value[0]?.authorName).toBe('Commenter')

    const updated = comments.update(created.value.id, 'Updated @carol', principal)
    expect(updated.ok).toBe(true)
    if (updated.ok) expect(updated.value.mentions).toEqual(['carol'])

    const removed = comments.remove(created.value.id, principal)
    expect(removed.ok).toBe(true)
    expect(indexed).toEqual([page.value.id, page.value.id, page.value.id])
  })
})
