import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, test } from 'vitest'
import InteractiveGraph from './InteractiveGraph.vue'
import type { PageGraph } from '@/lib/api'

const graph: PageGraph = {
  nodes: [
    { path: 'docs/a', title: 'A', kind: 'page' },
    { path: 'docs/b', title: 'B', kind: 'page' },
  ],
  edges: [{ source: 'docs/a', target: 'docs/b', kind: 'wikilink' }],
}

const makeRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/_new', name: 'new', component: { template: '<div />' } },
      { path: '/:path(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  return router
}

describe('InteractiveGraph', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('supports keyboard traversal, canvas zoom keys, and link-list fallback', async () => {
    const router = await makeRouter()
    const wrapper = mount(InteractiveGraph, {
      attachTo: document.body,
      props: { graph, title: 'Graph view' },
      global: { plugins: [router] },
    })
    await wrapper.vm.$nextTick()

    const nodes = Array.from(document.querySelectorAll<SVGGElement>('.interactive-graph-node[role="button"]'))
    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.getAttribute('aria-label')).toContain('A')
    expect(document.querySelector('nav[aria-label="Graph pages as links"]')?.textContent).toContain('B')

    nodes[0]?.focus()
    await new DOMWrapper(nodes[0]!).trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(nodes[1])

    await new DOMWrapper(nodes[1]!).trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/docs/b')

    const svg = document.querySelector<SVGSVGElement>('.interactive-graph-canvas')
    const graphLayer = svg?.querySelector<SVGGElement>('g[transform]')
    const before = graphLayer?.getAttribute('transform')
    await new DOMWrapper(svg!).trigger('keydown', { key: '+' })
    expect(graphLayer?.getAttribute('transform')).not.toBe(before)
  })
})
