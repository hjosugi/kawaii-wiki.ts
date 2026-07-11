<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { useDialogs } from '@/composables/useDialogs'
import { useI18n } from '@/lib/i18n'

const dialogs = useDialogs()
const { t } = useI18n()
const value = ref('')
const input = ref<HTMLInputElement | null>(null)

watch(() => dialogs.active.value, async (request) => {
  value.value = request?.kind === 'prompt' ? request.defaultValue ?? '' : ''
  if (request?.kind === 'prompt') {
    await nextTick()
    input.value?.select()
  }
})

const submit = (): void => {
  const request = dialogs.active.value
  if (!request) return
  if (request.kind === 'prompt') {
    if (request.required && !value.value.trim()) return
    dialogs.settle(value.value)
  } else {
    dialogs.settle(true)
  }
}
</script>

<template>
  <ModalDialog
    :open="Boolean(dialogs.active.value)"
    :title="dialogs.active.value?.title || t('confirmAction')"
    @close="dialogs.settle(dialogs.active.value?.kind === 'confirm' ? false : null)"
  >
    <form v-if="dialogs.active.value" class="grid gap-4" @submit.prevent="submit">
      <div>
        <h2 class="text-lg font-semibold">{{ dialogs.active.value.title || t('confirmAction') }}</h2>
        <p class="mt-2 whitespace-pre-line text-sm text-[var(--c-text-muted)]">{{ dialogs.active.value.message }}</p>
      </div>
      <label v-if="dialogs.active.value.kind === 'prompt'" class="grid gap-1 text-sm">
        <span>{{ dialogs.active.value.inputLabel || 'Value' }}</span>
        <input ref="input" v-model="value" class="input" :required="dialogs.active.value.required" />
      </label>
      <div class="flex justify-end gap-2">
        <button class="btn-ghost" type="button" @click="dialogs.settle(dialogs.active.value.kind === 'confirm' ? false : null)">
          {{ dialogs.active.value.cancelLabel || t('cancel') }}
        </button>
        <button :class="dialogs.active.value.danger ? 'btn-danger' : 'btn-primary'" type="submit">
          {{ dialogs.active.value.confirmLabel || t('confirm') }}
        </button>
      </div>
    </form>
  </ModalDialog>
</template>
