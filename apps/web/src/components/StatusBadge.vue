<script setup lang="ts">
import type { PageStatus } from '@kawaii-wiki/core'
import { useI18n, type MessageKey } from '@/lib/i18n'

defineProps<{ status: PageStatus }>()

const { t } = useI18n()
const label: Record<PageStatus, MessageKey> = {
  draft: 'draft',
  'in-review': 'inReview',
  verified: 'verified',
  outdated: 'outdated',
}

const tone: Record<PageStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  'in-review': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  outdated: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}
</script>

<template>
  <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="tone[status]">{{ t(label[status]) }}</span>
</template>
