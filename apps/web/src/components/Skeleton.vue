<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  lines?: number
  title?: boolean
}>(), {
  label: 'Loading',
  lines: 3,
  title: false,
})

const widthFor = (index: number): string => {
  const widths = ['92%', '78%', '64%', '86%', '70%']
  return widths[index % widths.length]!
}
</script>

<template>
  <div class="skeleton-stack" role="status" aria-live="polite" :aria-label="label">
    <span class="sr-only">{{ label }}</span>
    <div v-if="title" class="skeleton-line skeleton-title"></div>
    <div
      v-for="index in lines"
      :key="index"
      class="skeleton-line"
      :style="{ width: widthFor(index - 1) }"
    ></div>
  </div>
</template>
