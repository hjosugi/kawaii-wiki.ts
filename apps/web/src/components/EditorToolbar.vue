<script setup lang="ts">
import { useI18n, type MessageKey } from '@/lib/i18n'

interface EditorToolbarAction {
  readonly id: string
  readonly group: 'text' | 'insert' | 'media'
  readonly label: MessageKey
  readonly icon: string
  readonly detail: string
  readonly run: () => void | Promise<void>
}

const props = defineProps<{
  actions: readonly EditorToolbarAction[]
  busyId?: string
  disabledIds?: readonly string[]
}>()

const { t } = useI18n()
const groups = ['text', 'insert', 'media'] as const
const inGroup = (group: EditorToolbarAction['group']): EditorToolbarAction[] => props.actions.filter((action) => action.group === group)
</script>

<template>
  <div class="editor-toolbar" :aria-label="t('toolbarInsert')">
    <div v-for="group in groups" :key="group" class="editor-toolbar-group">
      <span class="editor-toolbar-label">{{ group === 'text' ? t('toolbarText') : group === 'media' ? t('toolbarMedia') : t('toolbarInsert') }}</span>
      <button
        v-for="action in inGroup(group)"
        :key="action.id"
        class="btn-ghost editor-tool"
        type="button"
        :data-tooltip="action.detail"
        :title="t(action.label)"
        :aria-label="t(action.label)"
        :disabled="disabledIds?.includes(action.id)"
        @mousedown.prevent
        @click="action.run"
      >
        <span class="editor-tool-icon" aria-hidden="true">{{ action.icon }}</span>
        <span>{{ busyId === action.id ? 'Uploading...' : t(action.label) }}</span>
      </button>
    </div>
    <slot />
  </div>
</template>
