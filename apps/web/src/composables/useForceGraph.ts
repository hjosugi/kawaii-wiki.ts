import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PageGraph, PageGraphEdge, PageGraphNode } from '@/lib/api'
import { useReducedMotion } from '@/composables/useReducedMotion'

export interface SimNode extends PageGraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  degree: number
}

export interface SimEdge extends PageGraphEdge {
  sourceNode: SimNode
  targetNode: SimNode
}

export interface ForceGraphProps {
  readonly graph: PageGraph
  readonly focusPath?: string | null
  readonly compact?: boolean
}

export const useForceGraph = (props: ForceGraphProps) => {
  const reducedMotion = useReducedMotion()
  const selected = ref<string | null>(props.focusPath ?? null)
  const showMissing = ref(true)
  const localOnly = ref(Boolean(props.focusPath))
  const localDepth = ref(2)
  const linkDistance = ref(112)
  const linkStrength = ref(0.045)
  const repulsion = ref(2600)
  const zoom = ref(1)
  const pan = ref({ x: 0, y: 0 })
  const nodes = ref<SimNode[]>([])
  let raf = 0
  let alpha = 0
  let dragging: { path: string; pointerId: number } | null = null
  let panning: { x: number; y: number; panX: number; panY: number; pointerId: number } | null = null

  const width = computed(() => (props.compact ? 320 : 980))
  const height = computed(() => (props.compact ? 250 : 620))
  const centerX = computed(() => width.value / 2)
  const centerY = computed(() => height.value / 2)

  const adjacency = computed(() => {
    const map = new Map<string, Set<string>>()
    for (const node of props.graph.nodes) map.set(node.path, new Set())
    for (const edge of props.graph.edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set())
      if (!map.has(edge.target)) map.set(edge.target, new Set())
      map.get(edge.source)!.add(edge.target)
      map.get(edge.target)!.add(edge.source)
    }
    return map
  })

  const visiblePaths = computed(() => {
    const all = new Set(props.graph.nodes.map((node) => node.path))
    if (!localOnly.value || !props.focusPath) return all

    const seen = new Set<string>([props.focusPath])
    let frontier = [props.focusPath]
    for (let depth = 0; depth < localDepth.value; depth++) {
      const next: string[] = []
      for (const path of frontier) {
        for (const linked of adjacency.value.get(path) ?? []) {
          if (seen.has(linked)) continue
          seen.add(linked)
          next.push(linked)
        }
      }
      frontier = next
    }
    return seen
  })

  const visibleGraph = computed(() => {
    const allowed = visiblePaths.value
    const graphNodes = props.graph.nodes.filter(
      (node) => allowed.has(node.path) && (showMissing.value || node.kind !== 'missing'),
    )
    const nodeSet = new Set(graphNodes.map((node) => node.path))
    const graphEdges = props.graph.edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))
    return { nodes: graphNodes, edges: graphEdges }
  })

  const nodeByPath = computed(() => new Map(nodes.value.map((node) => [node.path, node])))
  const edges = computed<SimEdge[]>(() =>
    visibleGraph.value.edges
      .map((edge) => {
        const sourceNode = nodeByPath.value.get(edge.source)
        const targetNode = nodeByPath.value.get(edge.target)
        return sourceNode && targetNode ? { ...edge, sourceNode, targetNode } : null
      })
      .filter((edge): edge is SimEdge => Boolean(edge)),
  )

  const selectedNode = computed(() => nodeByPath.value.get(selected.value ?? '') ?? null)
  const incoming = computed(() => visibleGraph.value.edges.filter((edge) => edge.target === selected.value))
  const outgoing = computed(() => visibleGraph.value.edges.filter((edge) => edge.source === selected.value))
  const transform = computed(() => `translate(${pan.value.x} ${pan.value.y}) scale(${zoom.value})`)

  const stepSimulation = (): boolean => {
    const items = nodes.value
    if (items.length === 0) return false

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!
        const b = items[j]!
        const dx = b.x - a.x || 0.01
        const dy = b.y - a.y || 0.01
        const distanceSq = Math.max(64, dx * dx + dy * dy)
        const force = (repulsion.value * alpha) / distanceSq
        const fx = dx * force
        const fy = dy * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    for (const edge of edges.value) {
      const dx = edge.targetNode.x - edge.sourceNode.x
      const dy = edge.targetNode.y - edge.sourceNode.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const force = (distance - linkDistance.value) * linkStrength.value * alpha
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      edge.sourceNode.vx += fx
      edge.sourceNode.vy += fy
      edge.targetNode.vx -= fx
      edge.targetNode.vy -= fy
    }

    for (const node of items) {
      node.vx += (centerX.value - node.x) * 0.006 * alpha
      node.vy += (centerY.value - node.y) * 0.006 * alpha
      if (node.path === props.focusPath) {
        node.vx += (centerX.value - node.x) * 0.018 * alpha
        node.vy += (centerY.value - node.y) * 0.018 * alpha
      }
      if (!dragging || dragging.path !== node.path) {
        node.x += node.vx
        node.y += node.vy
      }
      node.vx *= 0.82
      node.vy *= 0.82
    }

    alpha *= 0.965
    return alpha > 0.018
  }

  const settleSimulation = (): void => {
    for (let i = 0; i < 90 && alpha > 0.018; i++) stepSimulation()
  }

  const tick = (): void => {
    if (stepSimulation() && !reducedMotion.value) raf = requestAnimationFrame(tick)
  }

  const restart = (): void => {
    alpha = Math.max(alpha, 0.7)
    cancelAnimationFrame(raf)
    if (reducedMotion.value) settleSimulation()
    else tick()
  }

  const initialise = (): void => {
    cancelAnimationFrame(raf)
    const old = new Map(nodes.value.map((node) => [node.path, node]))
    const degree = new Map<string, number>()
    for (const edge of visibleGraph.value.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    }

    const count = visibleGraph.value.nodes.length
    nodes.value = visibleGraph.value.nodes.map((node, index) => {
      const previous = old.get(node.path)
      const angle = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2
      const ring = props.compact ? 72 : 180
      const nodeDegree = degree.get(node.path) ?? 0
      return {
        ...node,
        x: previous?.x ?? centerX.value + Math.cos(angle) * ring,
        y: previous?.y ?? centerY.value + Math.sin(angle) * ring,
        vx: previous?.vx ?? 0,
        vy: previous?.vy ?? 0,
        degree: nodeDegree,
        radius: node.kind === 'missing' ? 4.5 : Math.min(18, 5.5 + Math.sqrt(nodeDegree + 1) * 3.2),
      }
    })

    if (!selected.value || !nodeByPath.value.has(selected.value)) {
      selected.value = props.focusPath && nodeByPath.value.has(props.focusPath)
        ? props.focusPath
        : nodes.value[0]?.path ?? null
    }
    alpha = 1
    if (reducedMotion.value) settleSimulation()
    else tick()
  }

  const screenToGraph = (event: PointerEvent, svg: SVGSVGElement): { x: number; y: number } => {
    const rect = svg.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * width.value
    const y = ((event.clientY - rect.top) / rect.height) * height.value
    return {
      x: (x - pan.value.x) / zoom.value,
      y: (y - pan.value.y) / zoom.value,
    }
  }

  const selectNode = (path: string): void => {
    selected.value = path
    restart()
  }

  const startNodeDrag = (event: PointerEvent, node: SimNode): void => {
    const svg = (event.currentTarget as SVGGElement).ownerSVGElement
    if (!svg) return
    event.stopPropagation()
    ;(event.currentTarget as SVGGElement).setPointerCapture(event.pointerId)
    selected.value = node.path
    dragging = { path: node.path, pointerId: event.pointerId }
    const point = screenToGraph(event, svg)
    node.x = point.x
    node.y = point.y
    node.vx = 0
    node.vy = 0
    restart()
  }

  const moveNodeDrag = (event: PointerEvent, node: SimNode): void => {
    if (!dragging || dragging.pointerId !== event.pointerId || dragging.path !== node.path) return
    const svg = (event.currentTarget as SVGGElement).ownerSVGElement
    if (!svg) return
    const point = screenToGraph(event, svg)
    node.x = point.x
    node.y = point.y
    node.vx = 0
    node.vy = 0
    restart()
  }

  const endNodeDrag = (event: PointerEvent): void => {
    if (dragging?.pointerId === event.pointerId) dragging = null
  }

  const startPan = (event: PointerEvent): void => {
    ;(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId)
    panning = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y, pointerId: event.pointerId }
  }

  const movePan = (event: PointerEvent): void => {
    if (!panning || panning.pointerId !== event.pointerId) return
    pan.value = {
      x: panning.panX + (event.clientX - panning.x),
      y: panning.panY + (event.clientY - panning.y),
    }
  }

  const endPan = (event: PointerEvent): void => {
    if (panning?.pointerId === event.pointerId) panning = null
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    zoomBy(event.deltaY > 0 ? 0.9 : 1.1)
  }

  const zoomBy = (factor: number): void => {
    const next = Math.min(2.8, Math.max(0.45, zoom.value * factor))
    zoom.value = Number(next.toFixed(3))
  }

  const zoomIn = (): void => {
    zoomBy(1.12)
  }

  const zoomOut = (): void => {
    zoomBy(0.88)
  }

  const panBy = (x: number, y: number): void => {
    pan.value = { x: pan.value.x + x, y: pan.value.y + y }
  }

  const resetView = (): void => {
    zoom.value = 1
    pan.value = { x: 0, y: 0 }
    initialise()
  }

  const nearestNodeInDirection = (
    fromPath: string,
    direction: 'up' | 'down' | 'left' | 'right',
  ): SimNode | null => {
    const from = nodeByPath.value.get(fromPath)
    if (!from) return null
    const vector = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    }[direction]

    return nodes.value
      .filter((node) => node.path !== fromPath)
      .map((node) => {
        const dx = node.x - from.x
        const dy = node.y - from.y
        const distance = Math.hypot(dx, dy)
        if (!distance) return null
        const alignment = (dx * vector.x + dy * vector.y) / distance
        if (alignment <= 0.2) return null
        return { node, score: distance / alignment }
      })
      .filter((candidate): candidate is { node: SimNode; score: number } => Boolean(candidate))
      .sort((a, b) => a.score - b.score)[0]?.node ?? null
  }

  const selectNearestNode = (
    fromPath: string,
    direction: 'up' | 'down' | 'left' | 'right',
  ): string | null => {
    const next = nearestNodeInDirection(fromPath, direction)
    if (!next) return null
    selectNode(next.path)
    return next.path
  }

  watch(
    () => [props.graph, props.focusPath, showMissing.value, localOnly.value, localDepth.value],
    initialise,
    { deep: true, immediate: true },
  )

  watch([linkDistance, linkStrength, repulsion], restart)

  watch(reducedMotion, (reduce) => {
    cancelAnimationFrame(raf)
    if (reduce) settleSimulation()
    else restart()
  })

  onBeforeUnmount(() => cancelAnimationFrame(raf))

  return {
    selected,
    showMissing,
    localOnly,
    localDepth,
    linkDistance,
    repulsion,
    zoom,
    pan,
    nodes,
    width,
    height,
    visibleGraph,
    edges,
    selectedNode,
    incoming,
    outgoing,
    transform,
    reducedMotion,
    selectNode,
    selectNearestNode,
    startNodeDrag,
    moveNodeDrag,
    endNodeDrag,
    startPan,
    movePan,
    endPan,
    onWheel,
    panBy,
    zoomIn,
    zoomOut,
    resetView,
  }
}
