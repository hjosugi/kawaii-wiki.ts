<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { yCollab } from 'y-codemirror.next'
import { EditorState } from '@codemirror/state'
import { type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { Api, getToken } from '@/lib/api'
import { WS_BASE_URL } from '@/lib/url'
import { clipboardHttpUrl } from '@/lib/linkPreview'
import { useAuth } from '@/stores/auth'
import { useMarkdownFeatures } from '@/composables/useMarkdownFeatures'
import { vMarkdownEnhance } from '@/lib/markdownEnhance'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { embedSnippet, eventSnippet, infoboxSnippet, linksSnippet, streamSnippet, twitchSnippet, youtubeSnippet } from '@/lib/editorSnippets'
import EditorToolbar from '@/components/EditorToolbar.vue'
import AssetPicker from '@/components/AssetPicker.vue'
import ImageUploadDialog from '@/components/ImageUploadDialog.vue'
import { useImageUpload } from '@/composables/useImageUpload'
import { markdownEditorExtensions, useCodeMirrorCommands } from '@/composables/useCodeMirrorEditor'

const props = defineProps<{ room: string; assetFolder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)
const text = ref('')
const synced = ref(false)
const showAssets = ref(false)
const mode = ref<'write' | 'preview'>('write')
const { markdownFeatures, markdownRenderer } = useMarkdownFeatures()
const preview = computed(() => markdownRenderer.value.renderMarkdown(text.value).html)
const auth = useAuth()
const { t } = useI18n()
const {
  uploading,
  uploadError,
  pendingImageFiles,
  cancelImageUpload,
  uploadPreparedImages,
  onImageInput,
  handleImagePaste,
  handleImageDrop,
} = useImageUpload({
  folder: () => props.assetFolder,
  insert: (asset, alt) => insertSnippet(`![${alt}](${asset.url})\n`),
})

let view: EditorView | null = null
const { replaceSelection, insertSnippet, insertPendingLinkPreview, surround, insertLinePrefix } =
  useCodeMirrorCommands(() => view)
let provider: WebsocketProvider | null = null
let ydoc: Y.Doc | null = null
let disposed = false

/** Deterministic per-user colour so remote cursors are stable & distinct. */
function userColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h}, 70%, 55%)`
}

interface EditorAction {
  id: string
  group: 'text' | 'insert' | 'media'
  label: MessageKey
  icon: string
  detail: string
  keywords: string[]
  run: () => void
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
  { id: 'stream', group: 'insert', label: 'toolbarStream', icon: 'Live', detail: 'Insert a stream schedule block', keywords: ['stream', 'live', '配信'], run: () => insertSnippet(streamSnippet()) },
  { id: 'youtube', group: 'insert', label: 'toolbarYouTube', icon: 'YT', detail: 'Insert a click-to-load YouTube embed', keywords: ['youtube', 'video', '動画'], run: () => insertSnippet(youtubeSnippet()) },
  { id: 'twitch', group: 'insert', label: 'toolbarTwitch', icon: 'Tw', detail: 'Insert a click-to-load Twitch embed', keywords: ['twitch', 'stream', 'clip'], run: () => insertSnippet(twitchSnippet()) },
  { id: 'callout', group: 'insert', label: 'toolbarCallout', icon: '!', detail: 'Insert a highlighted note block', keywords: ['callout', 'note', '注意', 'メモ'], run: () => insertSnippet('```callout\\ntype: info\\ntitle: Note\\n\\nCallout text\\n```\\n') },
  { id: 'infobox', group: 'insert', label: 'toolbarInfobox', icon: 'ID', detail: 'Insert a profile or info card', keywords: ['infobox', 'profile', 'プロフィール'], run: () => insertSnippet(infoboxSnippet()) },
  { id: 'embed', group: 'insert', label: 'toolbarEmbed', icon: '<>', detail: 'Insert a rich link card', keywords: ['embed', 'bookmark', 'card', '埋め込み'], run: () => insertSnippet(embedSnippet()) },
  { id: 'links', group: 'insert', label: 'toolbarLinks', icon: '@', detail: 'Insert social/link buttons', keywords: ['links', 'social', 'sns', 'リンク集'], run: () => insertSnippet(linksSnippet()) },
  { id: 'image', group: 'media', label: 'toolbarImage', icon: 'Img', detail: 'Upload and insert an image', keywords: ['image', 'upload', '画像'], run: chooseImage },
  { id: 'assets', group: 'media', label: 'toolbarAssets', icon: 'Lib', detail: 'Browse uploaded assets', keywords: ['asset', 'file', '添付'], run: () => { showAssets.value = true } },
])

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
      extensions: markdownEditorExtensions({
        completion: slashCompletions,
        drop: handleImageDrop,
        paste(event) {
            if (handleImagePaste(event)) return true
            const url = clipboardHttpUrl(event.clipboardData)
            if (!url) return false
            event.preventDefault()
            insertPendingLinkPreview(url)
            return true
        },
        extra: [yCollab(ytext, provider.awareness)],
      }),
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
      <EditorToolbar :actions="editorActions" :busy-id="uploading ? 'image' : undefined" :disabled-ids="pendingImageFiles.length ? ['image'] : []">
        <input ref="uploadInput" class="hidden" type="file" accept="image/*" multiple aria-label="Upload image files" @change="onImageInput" />
      </EditorToolbar>
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
      @cancel="cancelImageUpload"
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
