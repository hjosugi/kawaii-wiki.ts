<script setup lang="ts">
interface SegmentOption {
  readonly value: string
  readonly label: string
}

defineProps<{
  modelValue: string
  options: readonly SegmentOption[]
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="inline-flex rounded-md border border-[var(--c-border)] p-0.5" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="rounded px-3 py-1 text-sm font-medium transition-colors"
      :class="modelValue === option.value
        ? 'bg-[var(--c-accent)] text-white'
        : 'text-[var(--c-text-muted)] hover:bg-[var(--c-surface-muted)]'"
      :aria-pressed="modelValue === option.value"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
