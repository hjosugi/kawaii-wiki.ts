import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import type { PageGraph } from '@/lib/api'
import { useForceGraph } from './useForceGraph'

vi.mock('@/composables/useReducedMotion', () => ({
  useReducedMotion: () => ref(true),
}))

const graph: PageGraph = {
  nodes: [
    { path: 'home', title: 'Home', kind: 'page' },
    { path: 'docs/a', title: 'A', kind: 'page' },
    { path: 'docs/b', title: 'B', kind: 'page' },
    { path: 'docs/c', title: 'C', kind: 'page' },
    { path: 'missing/page', title: 'Missing', kind: 'missing' },
  ],
  edges: [
    { source: 'home', target: 'docs/a', kind: 'wikilink' },
    { source: 'home', target: 'docs/b', kind: 'markdown' },
    { source: 'docs/a', target: 'docs/c', kind: 'wikilink' },
    { source: 'docs/c', target: 'missing/page', kind: 'wikilink' },
  ],
}

const mountGraph = () => {
  let api!: ReturnType<typeof useForceGraph>
  const Harness = defineComponent({
    setup() {
      api = useForceGraph({ graph, focusPath: 'home' })
      return () => null
    },
  })
  const wrapper = mount(Harness)
  return { api, wrapper }
}

const roundedPositions = (api: ReturnType<typeof useForceGraph>) =>
  api.nodes.value.map((node) => [node.path, Math.round(node.x), Math.round(node.y)])

describe('useForceGraph', () => {
  test('settles deterministic node positions for the same graph input', () => {
    const first = mountGraph()
    const second = mountGraph()

    expect(roundedPositions(first.api)).toEqual(roundedPositions(second.api))
    expect(first.api.nodes.value.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true)

    first.wrapper.unmount()
    second.wrapper.unmount()
  })

  test('derives node degree and radius from visible edges', async () => {
    const { api, wrapper } = mountGraph()

    api.localOnly.value = false
    await Promise.resolve()
    const home = api.nodes.value.find((node) => node.path === 'home')!
    const leaf = api.nodes.value.find((node) => node.path === 'docs/b')!
    const missing = api.nodes.value.find((node) => node.path === 'missing/page')!
    expect(home.degree).toBe(2)
    expect(leaf.degree).toBe(1)
    expect(home.radius).toBeGreaterThan(leaf.radius)
    expect(missing.radius).toBe(4.5)

    wrapper.unmount()
  })

  test('filters the graph by local depth and missing-node visibility', async () => {
    const { api, wrapper } = mountGraph()

    api.localDepth.value = 1
    await Promise.resolve()
    expect(api.visibleGraph.value.nodes.map((node) => node.path).sort()).toEqual(['docs/a', 'docs/b', 'home'])

    api.localDepth.value = 3
    api.showMissing.value = false
    await Promise.resolve()
    expect(api.visibleGraph.value.nodes.map((node) => node.path).sort()).toEqual(['docs/a', 'docs/b', 'docs/c', 'home'])
    expect(api.visibleGraph.value.edges.some((edge) => edge.target === 'missing/page')).toBe(false)

    wrapper.unmount()
  })

  test('applies bounded zoom and directional keyboard selection', () => {
    const { api, wrapper } = mountGraph()

    api.zoomOut()
    for (let i = 0; i < 20; i += 1) api.zoomOut()
    expect(api.zoom.value).toBe(0.45)
    for (let i = 0; i < 30; i += 1) api.zoomIn()
    expect(api.zoom.value).toBe(2.8)

    const next = (['right', 'left', 'down', 'up'] as const)
      .map((direction) => api.selectNearestNode('home', direction))
      .find(Boolean) ?? null
    expect(next).toBeTruthy()
    expect(api.selected.value).toBe(next)

    wrapper.unmount()
  })
})
