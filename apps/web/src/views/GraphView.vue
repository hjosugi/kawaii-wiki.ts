<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Api, type PageGraph } from '@/lib/api'
import EmptyState from '@/components/EmptyState.vue'
import InteractiveGraph from '@/components/InteractiveGraph.vue'
import Skeleton from '@/components/Skeleton.vue'

const graph = ref<PageGraph>({ nodes: [], edges: [] })
const loading = ref(false)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    graph.value = await Api.graph()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Graph</h1>
        <p class="text-sm text-[var(--c-text-muted)] mt-1">
          Internal links, missing pages, and how the wiki hangs together.
        </p>
      </div>
      <button class="btn-ghost" type="button" :disabled="loading" @click="load">
        Refresh
      </button>
    </header>

    <Skeleton v-if="loading" label="Loading graph" title :lines="4" />
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <EmptyState
      v-else-if="!graph.nodes.length"
      title="No graph yet"
      message="Create pages and link them with [[Wiki Links]] or normal Markdown links."
    >
      <template #actions>
        <RouterLink to="/_new" class="btn-primary">New page</RouterLink>
      </template>
    </EmptyState>

    <InteractiveGraph v-else :graph="graph" title="Graph view" />
  </div>
</template>
