<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'

const props = defineProps<{
  path: string
  homePath?: string
  currentIcon?: string
}>()
const { t } = useI18n()

const crumbs = computed(() => {
  const segments = props.path.split('/').filter(Boolean)
  return segments.map((label, index) => ({
    label,
    path: segments.slice(0, index + 1).join('/'),
  }))
})
</script>

<template>
  <nav class="flex items-center gap-1.5 text-sm text-[var(--c-text-muted)] min-w-0" :aria-label="t('breadcrumb')">
    <RouterLink :to="'/' + (props.homePath || 'home')" class="hover:text-gray-900 dark:hover:text-gray-100 shrink-0">{{ t('home') }}</RouterLink>
    <template v-for="crumb in crumbs" :key="crumb.path">
      <span class="text-gray-300 dark:text-gray-700" aria-hidden="true">/</span>
      <RouterLink
        :to="'/' + crumb.path"
        class="inline-flex min-w-0 items-center gap-1 truncate hover:text-gray-900 dark:hover:text-gray-100"
      >
        <span v-if="props.currentIcon && crumb.path === props.path" class="shrink-0" aria-hidden="true">{{ props.currentIcon }}</span>
        {{ crumb.label }}
      </RouterLink>
    </template>
  </nav>
</template>
