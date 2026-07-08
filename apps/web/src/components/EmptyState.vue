<script setup lang="ts">
defineProps<{
  title: string
  message?: string
}>()
</script>

<template>
  <section class="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center bg-gray-50/60 dark:bg-gray-900/40">
    <h2 class="text-base font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
    <p v-if="message" class="text-sm text-gray-500 dark:text-[var(--c-text-muted)] mt-1">{{ message }}</p>
    <slot />
    <div v-if="$slots.actions" class="mt-5 flex justify-center gap-2">
      <slot name="actions" />
    </div>
  </section>
</template>
