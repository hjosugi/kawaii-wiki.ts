<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { useI18n } from '@/lib/i18n'

withDefaults(defineProps<{
  accept?: string
  multiple?: boolean
  disabled?: boolean
  ariaLabel?: string
}>(), {
  accept: undefined,
  multiple: false,
  disabled: false,
  ariaLabel: undefined,
})

const emit = defineEmits<{ change: [files: FileList | null] }>()
const input = ref<HTMLInputElement | null>(null)
const selectedNames = ref<string[]>([])
const { t } = useI18n()

const choose = (): void => {
  if (!input.value) return
  input.value.value = ''
  input.value.click()
}

const changed = (event: Event): void => {
  const files = (event.target as HTMLInputElement).files
  selectedNames.value = Array.from(files ?? []).map((file) => file.name)
  emit('change', files)
}
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2">
    <input
      ref="input"
      class="sr-only"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      :aria-label="ariaLabel || t('chooseFile')"
      @change="changed"
    />
    <button class="btn-ghost border border-[var(--c-border)]" type="button" :disabled="disabled" @click="choose">
      <AppIcon name="upload" :size="16" />{{ t(multiple ? 'chooseFiles' : 'chooseFile') }}
    </button>
    <span class="min-w-0 max-w-full truncate text-sm text-[var(--c-text-muted)]">
      {{ selectedNames.length ? selectedNames.join(', ') : t('noFileSelected') }}
    </span>
  </div>
</template>
