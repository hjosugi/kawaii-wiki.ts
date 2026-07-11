<script setup lang="ts">
import { Api, type PageGraph } from '@/lib/api'
import EmptyState from '@/components/EmptyState.vue'
import InteractiveGraph from '@/components/InteractiveGraph.vue'
import Skeleton from '@/components/Skeleton.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useI18n } from '@/lib/i18n'

const { data: graph, loading, error, reload: load } = useAsyncData<PageGraph>(Api.graph, {
  initial: { nodes: [], edges: [] },
})
const { t } = useI18n()
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ t('graph') }}</h1>
        <p class="text-sm text-[var(--c-text-muted)] mt-1">
          {{ t('graphDescription') }}
        </p>
      </div>
      <button class="btn-ghost" type="button" :disabled="loading" @click="load">
        {{ t('refresh') }}
      </button>
    </header>

    <Skeleton v-if="loading" label="Loading graph" title :lines="4" />
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <EmptyState
      v-else-if="!graph.nodes.length"
      :title="t('noGraphYet')"
      :message="t('graphDescription')"
    >
      <template #actions>
        <RouterLink to="/_new" class="btn-primary">{{ t('newPage') }}</RouterLink>
      </template>
    </EmptyState>

    <InteractiveGraph v-else :graph="graph" :title="t('graphView')" />
  </div>
</template>
