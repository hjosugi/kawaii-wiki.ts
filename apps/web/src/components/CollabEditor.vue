<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { yCollab } from 'y-codemirror.next'
import { basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { Api, getToken } from '@/lib/api'
import { WS_BASE_URL } from '@/lib/url'
import { clipboardImageFiles, imageFiles } from '@/lib/imageUpload'
import { useAuth } from '@/stores/auth'
import { useMarkdownFeatures } from '@/composables/useMarkdownFeatures'
import { vMarkdownEnhance } from '@/lib/markdownEnhance'
import { useI18n, type MessageKey } from '@/lib/i18n'
import AssetPicker from '@/components/AssetPicker.vue'
import ImageUploadDialog from '@/components/ImageUploadDialog.vue'

const props = defineProps<{ room: string; assetFolder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)
const text = ref('')
const synced = ref(false)
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const pendingImageFiles = ref<File[]>([])
const showAssets = ref(false)
const mode = ref<'write' | 'preview'>('write')
const { markdownFeatures, markdownRenderer } = useMarkdownFeatures()
const preview = computed(() => markdownRenderer.value.renderMarkdown(text.value).html)
const auth = useAuth()
const { t } = useI18n()

let view: EditorView | null = null
let provider: WebsocketProvider | null = null
let ydoc: Y.Doc | null = null
let disposed = false

/** Deterministic per-user colour so remote cursors are stable & distinct. */
function userColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h}, 70%, 55%)`
}

const pad = (value: number): string => String(value).padStart(2, '0')

const eventSnippet = (): string => {
  const start = new Date(Date.now() + 60 * 60 * 1000)
  start.setMinutes(0, 0, 0)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const format = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `\`\`\`event
title: Event title
start: ${format(start)}
end: ${format(end)}
timezone: ${zone}
location:
url:
description:
\`\`\`
`
}

const infoboxSnippet = (): string => `\`\`\`infobox
title: Name
image:
caption:
Field: value

Details go here.
\`\`\`
`

const linksSnippet = (): string => `\`\`\`links
[YouTube](https://youtube.com/@handle)
[X](https://x.com/handle)
[Shop](https://booth.pm/)
\`\`\`
`

const embedSnippet = (): string => `\`\`\`embed
url: https://example.com
title:
description:
\`\`\`
`

interface EditorAction {
  id: string
  group: 'text' | 'insert' | 'media'
  label: MessageKey
  icon: string
  detail: string
  keywords: string[]
  run: () => void
}

function replaceSelection(insert: string): void {
  if (!view) return
  const selection = view.state.selection.main
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: selection.from + insert.length },
    scrollIntoView: true,
  })
  view.focus()
}

function insertSnippet(snippet: string): void {
  if (!view) return
  const selection = view.state.selection.main
  const prefix = selection.from > 0 && !view.state.sliceDoc(selection.from - 1, selection.from).match(/\n/) ? '\n\n' : ''
  replaceSelection(prefix + snippet)
}

function surround(prefix: string, suffix: string, fallback: string): void {
  if (!view) return
  const selection = view.state.selection.main
  const selected = view.state.sliceDoc(selection.from, selection.to) || fallback
  replaceSelection(`${prefix}${selected}${suffix}`)
}

function insertLinePrefix(prefix: string, fallback: string): void {
  if (!view) return
  const selection = view.state.selection.main
  const line = view.state.doc.lineAt(selection.from)
  const textValue = view.state.sliceDoc(line.from, line.to) || fallback
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: `${prefix}${textValue.replace(/^#+\s*/, '')}` },
    selection: { anchor: line.from + prefix.length + textValue.length },
    scrollIntoView: true,
  })
  view.focus()
}

function chooseImage(): void {
  uploadInput.value?.click()
}

const editorActions = computed<EditorAction[]>(() => [
  { id: 'heading', group: 'text', label: 'toolbarHeading', icon: 'H2', detail: 'Add a section heading', keywords: ['heading', 'title', '見出し'], run: () => insertLinePrefix('## ', 'Heading') },
  { id: 'bold', group: 'text', label: 'toolbarBold', icon: 'B', detail: 'Make selected text bold', keywords: ['bold', '太字'], run: () => surround('**', '**', 'bold') },
  { id: 'link', group: 'text', label: 'toolbarLink', icon: '[]', detail: 'Insert a Markdown link', keywords: ['link', 'url', 'リンク'], run: () => surround('[', '](https://)', 'link') },
  { id: 'code', group: 'text', label: 'toolbarCode', icon: '</>', detail: 'Format selected text as code', keywords: ['code', 'コード'], run: () => surround('`', '`', 'code') },
  { id: 'table', group: 'insert', label: 'toolbarTable', icon: '| |', detail: 'Insert a two-column table', keywords: ['table', '表'], run: () => insertSnippet('| Column | Value |\\n| --- | --- |\\n|  |  |\\n') },
  { id: 'event', group: 'insert', label: 'toolbarEvent', icon: 'Cal', detail: 'Insert an event card block', keywords: ['event', 'calendar', '予定', 'イベント'], run: () => insertSnippet(eventSnippet()) },
  { id: 'callout', group: 'insert', label: 'toolbarCallout', icon: '!', detail: 'Insert a highlighted note block', keywords: ['callout', 'note', '注意', 'メモ'], run: () => insertSnippet('```callout\\ntype: info\\ntitle: Note\\n\\nCallout text\\n```\\n') },
  { id: 'infobox', group: 'insert', label: 'toolbarInfobox', icon: 'ID', detail: 'Insert a profile or info card', keywords: ['infobox', 'profile', 'プロフィール'], run: () => insertSnippet(infoboxSnippet()) },
  { id: 'embed', group: 'insert', label: 'toolbarEmbed', icon: '<>', detail: 'Insert a rich link card', keywords: ['embed', 'bookmark', 'card', '埋め込み'], run: () => insertSnippet(embedSnippet()) },
  { id: 'links', group: 'insert', label: 'toolbarLinks', icon: '@', detail: 'Insert social/link buttons', keywords: ['links', 'social', 'sns', 'リンク集'], run: () => insertSnippet(linksSnippet()) },
  { id: 'image', group: 'media', label: 'toolbarImage', icon: 'Img', detail: 'Upload and insert an image', keywords: ['image', 'upload', '画像'], run: chooseImage },
  { id: 'assets', group: 'media', label: 'toolbarAssets', icon: 'Lib', detail: 'Browse uploaded assets', keywords: ['asset', 'file', '添付'], run: () => { showAssets.value = true } },
])

const actionsByGroup = (group: EditorAction['group']): EditorAction[] =>
  editorActions.value.filter((action) => action.group === group)

const slashCompletions = (context: CompletionContext) => {
  const line = context.state.doc.lineAt(context.pos)
  const before = context.state.sliceDoc(line.from, context.pos)
  const match = before.match(/^\s*\/([\p{L}\p{N}_-]*)$/u)
  if (!match) return null
  const query = (match[1] ?? '').toLowerCase()
  const from = line.from + before.lastIndexOf('/')
  const options: Completion[] = editorActions.value
    .filter((action) => {
      const label = t(action.label).toLowerCase()
      return !query || label.includes(query) || action.id.includes(query) || action.keywords.some((keyword) => keyword.toLowerCase().includes(query))
    })
    .map((action) => ({
      label: t(action.label),
      detail: action.detail,
      type: action.group === 'media' ? 'file' : 'keyword',
      apply(completionView) {
        completionView.dispatch({
          changes: { from, to: context.pos, insert: '' },
          selection: { anchor: from },
          scrollIntoView: true,
        })
        action.run()
      },
    }))
  return { from, options, validFor: /^\/[\p{L}\p{N}_-]*$/u }
}

async function uploadImages(files: File[]): Promise<void> {
  if (!files.length) return
  uploadError.value = null
  uploading.value = true
  try {
    for (const file of files) {
      const asset = await Api.uploadAsset(file, props.assetFolder)
      const alt = asset.filename.replace(/\.[^.]+$/, '') || 'image'
      insertSnippet(`![${alt}](${asset.url})\n`)
    }
  } catch (e) {
    uploadError.value = (e as Error).message
  } finally {
    uploading.value = false
  }
}

function prepareImageUpload(files: File[]): void {
  if (!files.length || uploading.value) return
  uploadError.value = null
  pendingImageFiles.value = [...files]
}

async function uploadPreparedImages(files: File[]): Promise<void> {
  pendingImageFiles.value = []
  await uploadImages(files)
}

async function onImageInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  prepareImageUpload(imageFiles(input.files))
  input.value = ''
}

function insertAsset(markdown: string): void {
  insertSnippet(markdown)
  showAssets.value = false
}

onMounted(async () => {
  disposed = false
  ydoc = new Y.Doc()
  const ytext = ydoc.getText('content')
  // WebsocketProvider connects to `${WS_BASE_URL}/api/collab/<room>` and speaks the
  // y-websocket protocol our server implements.
  const token = getToken()
  const ticket = token ? await Api.realtimeTicket().catch(() => null) : null
  if (disposed || (token && !ticket)) return
  provider = new WebsocketProvider(`${WS_BASE_URL}/api/collab`, encodeURIComponent(props.room), ydoc, {
    params: ticket ? { ticket: ticket.ticket } : {},
  })

  const name = auth.user?.name ?? 'Anonymous'
  const color = userColor(name + (auth.user?.id ?? ''))
  provider.awareness.setLocalStateField('user', { name, color, colorLight: color })
  provider.on('sync', (isSynced: boolean) => {
    synced.value = isSynced
  })

  // Mirror the shared text out for the live preview + the parent's Save.
  const pushUp = (): void => {
    const value = ytext.toString()
    text.value = value
    emit('update:modelValue', value)
  }
  ytext.observe(pushUp)

  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        markdown(),
        autocompletion({ override: [slashCompletions] }),
        oneDark,
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          drop(event) {
            const files = imageFiles(event.dataTransfer?.files)
            if (!files.length) return false
            event.preventDefault()
            prepareImageUpload(files)
            return true
          },
          paste(event) {
            const files = clipboardImageFiles(event.clipboardData)
            if (!files.length) return false
            event.preventDefault()
            prepareImageUpload(files)
            return true
          },
        }),
        yCollab(ytext, provider.awareness),
      ],
    }),
  })
  pushUp()
})

onBeforeUnmount(() => {
  disposed = true
  view?.destroy()
  provider?.destroy()
  ydoc?.destroy()
})
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div class="flex items-center gap-1.5 text-xs" :class="synced ? 'text-green-600 dark:text-green-400' : 'text-[var(--c-text-muted)]'">
        <span class="w-2 h-2 rounded-full" :class="synced ? 'bg-green-500' : 'bg-gray-400'"></span>
        {{ synced ? 'Live - collaborative editing' : 'connecting...' }}
      </div>
      <div class="editor-toolbar" :aria-label="t('toolbarInsert')">
        <div v-for="group in (['text', 'insert', 'media'] as const)" :key="group" class="editor-toolbar-group">
          <span class="editor-toolbar-label">
            {{ group === 'text' ? t('toolbarText') : group === 'media' ? t('toolbarMedia') : t('toolbarInsert') }}
          </span>
          <button
            v-for="action in actionsByGroup(group)"
            :key="action.id"
            class="btn-ghost editor-tool"
            type="button"
            :data-tooltip="action.detail"
            :title="t(action.label)"
            :aria-label="t(action.label)"
            :disabled="(uploading || pendingImageFiles.length > 0) && action.id === 'image'"
            @click="action.run"
          >
            <span class="editor-tool-icon" aria-hidden="true">{{ action.icon }}</span>
            <span>{{ uploading && action.id === 'image' ? 'Uploading...' : t(action.label) }}</span>
          </button>
        </div>
        <input ref="uploadInput" class="hidden" type="file" accept="image/*" multiple aria-label="Upload image files" @change="onImageInput" />
      </div>
    </div>
    <p class="mb-2 text-xs text-[var(--c-text-muted)]">{{ t('insertMenuHint') }}</p>
    <p v-if="uploadError" class="text-sm text-red-600 mb-2">{{ uploadError }}</p>
    <div class="inline-flex rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] p-1 text-sm lg:hidden">
      <button
        class="rounded px-3 py-1.5"
        :class="mode === 'write' ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-text-muted)]'"
        type="button"
        :aria-pressed="mode === 'write'"
        @click="mode = 'write'"
      >
        Write
      </button>
      <button
        class="rounded px-3 py-1.5"
        :class="mode === 'preview' ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-text-muted)]'"
        type="button"
        :aria-pressed="mode === 'preview'"
        @click="mode = 'preview'"
      >
        Preview
      </button>
    </div>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:h-[60vh]">
      <div
        ref="host"
        class="h-[calc(100dvh-18rem)] min-h-[24rem] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 lg:block lg:h-auto"
        :class="mode === 'write' ? 'block' : 'hidden'"
      ></div>
      <div
        class="prose dark:prose-invert h-[calc(100dvh-18rem)] min-h-[24rem] max-w-none overflow-auto rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 lg:block lg:h-auto"
        :class="mode === 'preview' ? 'block' : 'hidden'"
        v-markdown-enhance="markdownFeatures"
        v-html="preview"
      ></div>
    </div>
    <AssetPicker :open="showAssets" :folder="props.assetFolder" @close="showAssets = false" @insert="insertAsset" />
    <ImageUploadDialog
      :open="pendingImageFiles.length > 0"
      :files="pendingImageFiles"
      @cancel="pendingImageFiles = []"
      @complete="uploadPreparedImages"
    />
  </div>
</template>

<style>
/* Remote collaborator cursors (y-codemirror.next colours these inline). */
.cm-ySelectionCaret {
  position: relative;
  border-left: 2px solid;
  margin-left: -1px;
}
.cm-ySelectionInfo {
  position: absolute;
  top: -1.4em;
  left: -2px;
  font-size: 0.65rem;
  padding: 0 4px;
  color: #fff;
  border-radius: 3px 3px 3px 0;
  white-space: nowrap;
  opacity: 0.9;
}
</style>
