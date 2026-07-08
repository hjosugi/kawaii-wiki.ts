<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const panel = ref<HTMLElement | null>(null)
const titleId = `drawer-${Math.random().toString(36).slice(2)}`
let previousFocus: HTMLElement | null = null
let previousBodyOverflow: string | null = null

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const focusableElements = (): HTMLElement[] =>
  Array.from(panel.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    .filter((element) => !element.hasAttribute('disabled'))

function close(): void {
  emit('update:open', false)
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const elements = focusableElements()
  if (!elements.length) {
    event.preventDefault()
    panel.value?.focus()
    return
  }
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

function cleanup(): void {
  window.removeEventListener('keydown', onKeydown)
  if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow
  previousBodyOverflow = null
}

watch(() => props.open, async (open) => {
  if (!open) {
    cleanup()
    previousFocus?.focus()
    previousFocus = null
    return
  }
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
  await nextTick()
  focusableElements()[0]?.focus() ?? panel.value?.focus()
}, { flush: 'post', immediate: true })

onBeforeUnmount(cleanup)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/40" @click="close"></div>
      <aside
        ref="panel"
        class="absolute left-0 top-0 flex h-full w-[min(22rem,calc(100vw-2rem))] flex-col border-r border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="flex h-14 items-center justify-between gap-3 border-b border-[var(--c-border)] px-4">
          <h2 :id="titleId" class="text-sm font-semibold uppercase tracking-wide text-[var(--c-text-muted)]">
            {{ title }}
          </h2>
          <button class="btn-ghost h-9 w-9 px-0" type="button" aria-label="Close navigation" @click="close">
            ×
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <slot />
        </div>
      </aside>
    </div>
  </Teleport>
</template>
