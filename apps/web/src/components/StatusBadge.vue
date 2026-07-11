<script setup lang="ts">
import type { PageStatus } from '@kawaii-wiki/core'

defineProps<{ status: PageStatus }>()

const tone: Record<PageStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  'in-review': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  outdated: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}
</script>

<template>
  <span class="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" :class="tone[status]">{{ status }}</span>
</template>
