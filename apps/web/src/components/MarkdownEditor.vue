<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { renderMarkdown } from '@wiki/core'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null

// Live preview shares the EXACT renderer the server uses on save.
const preview = computed(() => renderMarkdown(props.modelValue).html)

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
        }),
      ],
    }),
  })
})

// Keep the editor in sync if the value is replaced from the outside.
watch(
  () => props.modelValue,
  (value) => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  },
)

onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[65vh]">
    <div
      ref="host"
      class="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800"
    ></div>
    <div
      class="prose dark:prose-invert max-w-none rounded-lg border border-gray-200 dark:border-gray-800 p-5 overflow-auto bg-white dark:bg-gray-900"
      v-html="preview"
    ></div>
  </div>
</template>
