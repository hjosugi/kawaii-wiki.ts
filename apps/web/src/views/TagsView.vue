<script setup lang="ts">
import { Api, type LabelCount } from '@/lib/api'
import Skeleton from '@/components/Skeleton.vue'
import { useAsyncData } from '@/composables/useAsyncData'

const { data: labels, loading, error, reload: load } = useAsyncData<LabelCount[]>(Api.labels, { initial: [] })

// Scale the chip size with usage so popular tags stand out (0.85rem–1.4rem).
const maxCount = () => labels.value.reduce((max, l) => Math.max(max, l.count), 1)
const sizeRem = (count: number): string => (0.85 + (count / maxCount()) * 0.55).toFixed(2) + 'rem'

</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Tags</h1>
        <p class="mt-1 text-sm text-[var(--c-text-muted)]">Browse pages by label</p>
      </div>
      <button class="btn-ghost" type="button" :disabled="loading" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <Skeleton v-if="loading" label="Loading tags" :lines="3" />

    <div v-if="labels.length" class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <RouterLink
        v-for="entry in labels"
        :key="entry.label"
        class="link-quiet inline-flex items-center gap-1"
        :style="{ fontSize: sizeRem(entry.count) }"
        :to="{ name: 'search', query: { label: entry.label } }"
      >
        <span class="text-violet-600 dark:text-violet-400">#</span>{{ entry.label }}
        <span class="text-xs text-[var(--c-text-muted)]">{{ entry.count }}</span>
      </RouterLink>
    </div>

    <p v-if="!loading && !labels.length" class="text-gray-500">No tags yet.</p>
  </div>
</template>
