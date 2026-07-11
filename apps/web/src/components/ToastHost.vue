<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const toast = useToast()
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-16 z-[70] mx-auto flex max-w-md flex-col gap-2 px-4 sm:left-auto sm:right-4 sm:mx-0 sm:w-96 sm:px-0"
    aria-live="polite"
    aria-relevant="additions removals"
  >
    <TransitionGroup name="toast">
      <div
        v-for="item in toast.messages.value"
        :key="item.id"
        class="pointer-events-auto flex items-start gap-3 rounded-[var(--radius)] border bg-[var(--c-surface)] p-3 text-sm shadow-lg"
        :class="item.tone === 'error'
          ? 'border-red-400/70'
          : item.tone === 'success'
            ? 'border-emerald-400/70'
            : 'border-[var(--c-border)]'"
        :role="item.tone === 'error' ? 'alert' : 'status'"
      >
        <span aria-hidden="true">{{ item.tone === 'error' ? '!' : item.tone === 'success' ? '✓' : '•' }}</span>
        <span class="min-w-0 flex-1">{{ item.message }}</span>
        <button class="link-quiet -m-1 p-1" type="button" aria-label="Dismiss notification" @click="toast.dismiss(item.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>
