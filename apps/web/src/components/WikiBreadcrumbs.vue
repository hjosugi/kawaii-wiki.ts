<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  path: string
  homePath?: string
}>()

const crumbs = computed(() => {
  const segments = props.path.split('/').filter(Boolean)
  return segments.map((label, index) => ({
    label,
    path: segments.slice(0, index + 1).join('/'),
  }))
})
</script>

<template>
  <nav class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 min-w-0" aria-label="Breadcrumb">
    <RouterLink :to="'/' + (props.homePath || 'home')" class="hover:text-gray-900 dark:hover:text-gray-100 shrink-0">Home</RouterLink>
    <template v-for="crumb in crumbs" :key="crumb.path">
      <span class="text-gray-300 dark:text-gray-700">/</span>
      <RouterLink
        :to="'/' + crumb.path"
        class="hover:text-gray-900 dark:hover:text-gray-100 truncate"
      >
        {{ crumb.label }}
      </RouterLink>
    </template>
  </nav>
</template>
