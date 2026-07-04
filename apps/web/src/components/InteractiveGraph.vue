<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { PageGraph, PageGraphNode } from '@/lib/api'
import { useForceGraph } from '@/composables/useForceGraph'

const props = withDefaults(
  defineProps<{
    graph: PageGraph
    focusPath?: string | null
    title?: string
    compact?: boolean
  }>(),
  {
    focusPath: null,
    title: 'Interactive graph',
    compact: false,
  },
)

const router = useRouter()
const openNode = (node: PageGraphNode): void => {
  if (node.kind === 'missing') router.push({ name: 'new', query: { path: node.path } })
  else router.push('/' + node.path)
}

const {
  selected,
  showMissing,
  localOnly,
  localDepth,
  linkDistance,
  repulsion,
  nodes,
  width,
  height,
  visibleGraph,
  edges,
  selectedNode,
  incoming,
  outgoing,
  transform,
  selectNode,
  startNodeDrag,
  moveNodeDrag,
  endNodeDrag,
  startPan,
  movePan,
  endPan,
  onWheel,
  resetView,
} = useForceGraph(props)
</script>

<template>
  <section class="interactive-graph" :class="{ 'interactive-graph-compact': compact }">
    <div class="interactive-graph-head">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="!compact">{{ visibleGraph.nodes.length }} nodes / {{ visibleGraph.edges.length }} links</p>
      </div>
      <div class="interactive-graph-actions">
        <button class="btn-ghost" type="button" title="Reset view" @click="resetView">Reset</button>
        <RouterLink v-if="compact" to="/_graph" class="btn-ghost" title="Open graph">Open</RouterLink>
      </div>
    </div>

    <div v-if="!compact" class="interactive-graph-controls">
      <label>
        <input v-model="localOnly" type="checkbox" :disabled="!focusPath" />
        Local
      </label>
      <label>
        <input v-model="showMissing" type="checkbox" />
        Missing
      </label>
      <label>
        Depth
        <input v-model.number="localDepth" class="graph-range" type="range" min="1" max="4" />
      </label>
      <label>
        Link distance
        <input v-model.number="linkDistance" class="graph-range" type="range" min="60" max="220" />
      </label>
      <label>
        Force
        <input v-model.number="repulsion" class="graph-range" type="range" min="800" max="6200" />
      </label>
    </div>

    <svg
      class="interactive-graph-canvas"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      aria-label="Interactive wiki graph"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointercancel="endPan"
      @wheel="onWheel"
    >
      <rect class="interactive-graph-bg" :width="width" :height="height" />
      <g :transform="transform">
        <line
          v-for="edge in edges"
          :key="`${edge.source}-${edge.target}-${edge.kind}`"
          :x1="edge.sourceNode.x"
          :y1="edge.sourceNode.y"
          :x2="edge.targetNode.x"
          :y2="edge.targetNode.y"
          :class="[
            'interactive-graph-edge',
            edge.kind === 'markdown' ? 'interactive-graph-edge-markdown' : '',
            selected && (edge.source === selected || edge.target === selected) ? 'interactive-graph-edge-active' : ''
          ]"
        />

        <g
          v-for="node in nodes"
          :key="node.path"
          class="interactive-graph-node"
          :class="{
            'interactive-graph-node-active': node.path === selected,
            'interactive-graph-node-focus': node.path === focusPath,
            'interactive-graph-node-missing': node.kind === 'missing'
          }"
          :transform="`translate(${node.x}, ${node.y})`"
          tabindex="0"
          role="button"
          @click="selectNode(node.path)"
          @dblclick="openNode(node)"
          @keydown.enter.prevent="openNode(node)"
          @pointerdown="startNodeDrag($event, node)"
          @pointermove="moveNodeDrag($event, node)"
          @pointerup="endNodeDrag"
          @pointercancel="endNodeDrag"
        >
          <circle :r="node.radius" />
          <text v-if="!compact || node.path === selected || node.path === focusPath" :y="node.radius + 14" text-anchor="middle">
            {{ node.title }}
          </text>
        </g>
      </g>
    </svg>

    <div v-if="selectedNode && !compact" class="interactive-graph-detail">
      <div>
        <p class="interactive-graph-kicker">{{ selectedNode.kind === 'missing' ? 'Missing page' : 'Page' }}</p>
        <h3>{{ selectedNode.title }}</h3>
        <p class="font-mono">/{{ selectedNode.path }}</p>
      </div>
      <button class="btn-primary" type="button" @click="openNode(selectedNode)">
        {{ selectedNode.kind === 'missing' ? 'Create page' : 'Open page' }}
      </button>
      <div>
        <h4>Links to</h4>
        <button v-for="edge in outgoing" :key="`${edge.source}-${edge.target}-${edge.kind}`" class="link-quiet" type="button" @click="selectNode(edge.target)">
          /{{ edge.target }}
        </button>
        <p v-if="!outgoing.length">No outgoing links.</p>
      </div>
      <div>
        <h4>Linked from</h4>
        <button v-for="edge in incoming" :key="`${edge.source}-${edge.target}-${edge.kind}`" class="link-quiet" type="button" @click="selectNode(edge.source)">
          /{{ edge.source }}
        </button>
        <p v-if="!incoming.length">No backlinks.</p>
      </div>
    </div>
  </section>
</template>
