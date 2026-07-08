import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SearchView from './SearchView.vue'
import type { SearchHit } from '@/lib/api'

const api = vi.hoisted(() => ({
  search: vi.fn(),
  labels: vi.fn(),
  spaces: vi.fn(),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, Api: { ...actual.Api, ...api } }
})

const hit = (path: string, title = path): SearchHit => ({
  path,
  title,
  snippet: '<mark>banana</mark>',
  rank: 0,
  kind: 'page',
  updatedAt: 1,
})

const makeRouter = async (): Promise<Router> => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/_search', component: SearchView },
      { path: '/:path(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push('/_search')
  await router.isReady()
  return router
}

const settle = async (): Promise<void> => {
  await flushPromises()
  await Promise.resolve()
}

describe('SearchView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.search.mockReset()
    api.labels.mockResolvedValue([{ label: 'ops', count: 2 }])
    api.spaces.mockResolvedValue([{ key: 'docs', pages: 2, updatedAt: 1 }])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('debounces queries, syncs filters to the route, and loads more results', async () => {
    api.search
      .mockResolvedValueOnce({ query: 'banana', hits: [hit('docs/a', 'A')], total: 2, limit: 20, offset: 0, hasMore: true })
      .mockResolvedValueOnce({ query: 'banana', hits: [hit('docs/b', 'B')], total: 2, limit: 20, offset: 1, hasMore: false })
    const router = await makeRouter()
    const wrapper = mount(SearchView, { global: { plugins: [router] } })
    await settle()

    await wrapper.find('button:nth-of-type(3)').trigger('click')
    await wrapper.find('input[placeholder="Path prefix"]').setValue('docs')
    await wrapper.find('input[placeholder="Search the wiki..."]').setValue('banana')
    await vi.advanceTimersByTimeAsync(200)
    await settle()

    expect(api.search).toHaveBeenCalledWith('banana', expect.objectContaining({
      filters: expect.objectContaining({ pathPrefix: 'docs' }),
      limit: 20,
      offset: 0,
    }))
    expect(router.currentRoute.value.query).toMatchObject({ q: 'banana', pathPrefix: 'docs' })
    expect(wrapper.text()).toContain('2 results')
    expect(wrapper.text()).toContain('A')

    await wrapper.find('button.btn-ghost.mt-4').trigger('click')
    await settle()

    expect(api.search).toHaveBeenLastCalledWith('banana', expect.objectContaining({ offset: 1 }))
    expect(wrapper.text()).toContain('B')
  })

  test('uses arrow keys and enter to open the active result', async () => {
    api.search.mockResolvedValue({
      query: 'banana',
      hits: [hit('docs/a', 'A'), hit('docs/b', 'B')],
      total: 2,
      limit: 20,
      offset: 0,
      hasMore: false,
    })
    const router = await makeRouter()
    const wrapper = mount(SearchView, { global: { plugins: [router] } })
    await wrapper.find('input[placeholder="Search the wiki..."]').setValue('banana')
    await vi.advanceTimersByTimeAsync(200)
    await settle()

    const input = wrapper.find('input[placeholder="Search the wiki..."]')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    await settle()

    expect(router.currentRoute.value.path).toBe('/docs/b')
  })
})
