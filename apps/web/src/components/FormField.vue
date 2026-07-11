<script setup lang="ts">
defineProps<{
  label: string
  forId?: string
  hint?: string
  error?: string | null
}>()
</script>

<template>
  <div class="grid gap-1.5">
    <label v-if="forId" class="text-sm font-medium" :for="forId">{{ label }}</label>
    <span v-else class="text-sm font-medium">{{ label }}</span>
    <slot />
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-[var(--c-text-muted)]">{{ hint }}</p>
  </div>
</template>
