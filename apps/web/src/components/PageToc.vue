<script setup lang="ts">
interface TocEntry {
  id: string
  text: string
  level: number
}
withDefaults(defineProps<{
  entries: TocEntry[]
  sticky?: boolean
  showTitle?: boolean
}>(), {
  sticky: true,
  showTitle: true,
})
</script>

<template>
  <nav class="text-sm" :class="sticky ? 'sticky top-20 self-start' : ''">
    <div v-if="showTitle" class="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">On this page</div>
    <ul class="border-l border-gray-200 dark:border-gray-800">
      <li
        v-for="e in entries"
        :key="e.id"
        :style="{ paddingLeft: (e.level - 1) * 0.75 + 0.75 + 'rem' }"
      >
        <a
          :href="'#' + e.id"
          class="block py-0.5 -ml-px border-l border-transparent text-gray-500 hover:text-violet-600 hover:border-violet-600"
        >
          {{ e.text }}
        </a>
      </li>
    </ul>
  </nav>
</template>
