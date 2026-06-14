import { describe, test, expect } from 'bun:test'
import type { Principal } from '@wiki/core'
import { createDb } from './db/client.ts'
import { createServices } from './services/index.ts'

const admin: Principal = { id: 'admin-1', role: 'admin' }
const anon = null

describe('page + search slice (in-memory db)', () => {
  test('create renders, indexes, and is immediately findable', () => {
    const db = createDb(':memory:')
    const { pages, search } = createServices(db)

    const created = pages.create(
      { path: 'Docs/Intro', title: 'Intro', content: '# Hello\n\nA searchable banana paragraph.' },
      admin,
    )
    expect(created.ok).toBe(true)
    if (created.ok) {
      expect(created.value.path).toBe('docs/intro')
      expect(created.value.renderedHtml).toContain('<h1')
    }

    // Readable immediately (render is part of the write, not fire-and-forget).
    const fetched = pages.getByPath('docs/intro')
    expect(fetched.ok).toBe(true)

    // Searchable immediately.
    const result = search.search('banana')
    expect(result.hits.length).toBe(1)
    expect(result.hits[0]?.path).toBe('docs/intro')
    expect(result.hits[0]?.snippet).toContain('<mark>')
  })

  test('anonymous users cannot create pages', () => {
    const db = createDb(':memory:')
    const { pages } = createServices(db)
    const result = pages.create({ path: 'x', title: 'X', content: 'y' }, anon)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('forbidden')
  })

  test('duplicate paths conflict', () => {
    const db = createDb(':memory:')
    const { pages } = createServices(db)
    pages.create({ path: 'dup', title: 'A', content: 'a' }, admin)
    const second = pages.create({ path: 'dup', title: 'B', content: 'b' }, admin)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.kind).toBe('conflict')
  })

  test('update snapshots history and re-indexes', () => {
    const db = createDb(':memory:')
    const { pages, search } = createServices(db)
    pages.create({ path: 'p', title: 'P', content: 'original apple' }, admin)
    pages.update('p', { content: 'replaced orange' }, admin)

    expect(search.search('apple').hits.length).toBe(0)
    expect(search.search('orange').hits.length).toBe(1)
  })

  test('delete removes from search', () => {
    const db = createDb(':memory:')
    const { pages, search } = createServices(db)
    pages.create({ path: 'gone', title: 'Gone', content: 'ephemeral mango' }, admin)
    expect(search.search('mango').hits.length).toBe(1)
    pages.remove('gone', admin)
    expect(search.search('mango').hits.length).toBe(0)
  })
})
