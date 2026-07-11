<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { Api } from '@/lib/api'
import { clipboardHttpUrl, linkPreviewToEmbedFence } from '@/lib/linkPreview'
import { useI18n, type MessageKey } from '@/lib/i18n'
import AssetPicker from '@/components/AssetPicker.vue'
import ImageUploadDialog from '@/components/ImageUploadDialog.vue'
import { useDialogs } from '@/composables/useDialogs'
import { embedSnippet, eventSnippet, infoboxSnippet, linksSnippet, streamSnippet, twitchSnippet, youtubeSnippet } from '@/lib/editorSnippets'
import EditorToolbar from '@/components/EditorToolbar.vue'
import { editableDomToMarkdown, escapeAttr, escapeHtml, markdownToEditableHtml } from '@/lib/visualMarkdown'
import { useImageUpload } from '@/composables/useImageUpload'

const props = defineProps<{ modelValue: string; assetFolder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editor = ref<HTMLElement | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)
const showAssets = ref(false)
const slashMenuOpen = ref(false)
const slashQuery = ref('')
let lastEmitted = ''
let savedImageInsertRange: Range | null = null
const { t } = useI18n()
const dialogs = useDialogs()
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
  beforePrepare: saveImageInsertRange,
  afterCancel: () => { savedImageInsertRange = null },
  insert: (asset, alt) => insertImage(asset.url, alt),
})

interface VisualAction {
  id: string
  group: 'text' | 'insert' | 'media'
  label: MessageKey
  icon: string
  detail: string
  keywords: string[]
  run: () => void | Promise<void>
}

const currentMarkdown = (): string => {
  return editor.value ? editableDomToMarkdown(editor.value) : ''
}

function renderFromMarkdown(markdown: string): void {
  if (!editor.value) return
  editor.value.innerHTML = markdownToEditableHtml(markdown)
}

function syncFromDom(): void {
  const markdown = currentMarkdown()
  lastEmitted = markdown
  emit('update:modelValue', markdown)
}

function ensureSelection(): void {
  const root = editor.value
  if (!root) return
  const selection = window.getSelection()
  if (selection?.rangeCount && root.contains(selection.anchorNode)) return
  root.focus()
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function insertHtml(html: string): void {
  ensureSelection()
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const fragment = range.createContextualFragment(html)
  const last = fragment.lastChild
  range.insertNode(fragment)
  if (last) {
    range.setStartAfter(last)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  syncFromDom()
}

const wrapSelection = (tag: 'strong' | 'em' | 'a', attributes: Record<string, string> = {}): void => {
  ensureSelection()
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  if (range.collapsed) element.appendChild(document.createTextNode('\u200b'))
  else element.appendChild(range.extractContents())
  range.insertNode(element)
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
  syncFromDom()
}

const replaceCurrentBlock = (tag: 'p' | 'h1' | 'h2' | 'h3'): void => {
  ensureSelection()
  const root = editor.value
  const selection = window.getSelection()
  const origin = selection?.anchorNode instanceof Element
    ? selection.anchorNode
    : selection?.anchorNode?.parentElement
  const current = origin?.closest('p,h1,h2,h3,div')
  if (!root || !current || current === root || !root.contains(current)) {
    insertHtml(`<${tag}><br></${tag}>`)
    return
  }
  const replacement = document.createElement(tag)
  replacement.innerHTML = current.innerHTML
  current.replaceWith(replacement)
  const range = document.createRange()
  range.selectNodeContents(replacement)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
  syncFromDom()
}

const replaceCurrentBlockWithList = (ordered: boolean): void => {
  ensureSelection()
  const root = editor.value
  const selection = window.getSelection()
  const origin = selection?.anchorNode instanceof Element
    ? selection.anchorNode
    : selection?.anchorNode?.parentElement
  const current = origin?.closest('p,h1,h2,h3,div,li')
  if (!root || !current || current === root || !root.contains(current)) return
  const list = document.createElement(ordered ? 'ol' : 'ul')
  const item = document.createElement('li')
  item.innerHTML = current.innerHTML
  list.appendChild(item)
  current.replaceWith(list)
  const range = document.createRange()
  range.selectNodeContents(item)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
  syncFromDom()
}

function selectionRangeInEditor(): Range | null {
  const root = editor.value
  const selection = window.getSelection()
  if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode)) return null
  return selection.getRangeAt(0).cloneRange()
}

function restoreSelectionRange(range: Range | null): void {
  if (!range) return
  const root = editor.value
  if (!root || !root.contains(range.commonAncestorContainer)) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function formatBlock(tag: 'p' | 'h1' | 'h2' | 'h3'): void {
  replaceCurrentBlock(tag)
}

async function createLink(): Promise<void> {
  ensureSelection()
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    insertHtml(`<a href="https://">link</a>`)
    return
  }
  const href = await dialogs.prompt({ message: 'Enter the link destination.', inputLabel: 'Link URL', defaultValue: 'https://' })
  if (!href) return
  wrapSelection('a', { href })
}

function inlineCode(): void {
  ensureSelection()
  const selection = window.getSelection()
  const selected = selection?.toString() || 'code'
  insertHtml(`<code>${escapeHtml(selected)}</code>`)
}

function insertTable(): void {
  insertHtml('<table><thead><tr><th>Column</th><th>Value</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p><br></p>')
}

function insertCallout(): void {
  insertMarkdownSnippet('```callout\ntype: info\ntitle: Note\n\nCallout text\n```\n')
}

function insertMarkdownSnippet(markdown: string): void {
  insertHtml(markdownToEditableHtml(markdown) + '<p><br></p>')
}

async function insertPendingLinkPreview(url: string): Promise<void> {
  const range = selectionRangeInEditor()
  try {
    const preview = await Api.unfurl(url)
    restoreSelectionRange(range)
    insertMarkdownSnippet(linkPreviewToEmbedFence(preview))
  } catch {
    restoreSelectionRange(range)
    insertHtml(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`)
  }
}

function chooseImage(): void {
  uploadInput.value?.click()
}

const visualActions: VisualAction[] = [
  { id: 'paragraph', group: 'text', label: 'toolbarParagraph', icon: 'P', detail: 'Use normal paragraph text', keywords: ['paragraph', '本文'], run: () => formatBlock('p') },
  { id: 'heading', group: 'text', label: 'toolbarHeading', icon: 'H2', detail: 'Add a section heading', keywords: ['heading', '見出し'], run: () => formatBlock('h2') },
  { id: 'bold', group: 'text', label: 'toolbarBold', icon: 'B', detail: 'Make selected text bold', keywords: ['bold', '太字'], run: () => wrapSelection('strong') },
  { id: 'italic', group: 'text', label: 'toolbarItalic', icon: 'I', detail: 'Make selected text italic', keywords: ['italic', '斜体'], run: () => wrapSelection('em') },
  { id: 'code', group: 'text', label: 'toolbarCode', icon: '</>', detail: 'Format selected text as code', keywords: ['code', 'コード'], run: inlineCode },
  { id: 'link', group: 'text', label: 'toolbarLink', icon: '[]', detail: 'Insert or edit a link', keywords: ['link', 'url', 'リンク'], run: createLink },
  { id: 'bullets', group: 'text', label: 'toolbarUnorderedList', icon: '-', detail: 'Make a bullet list', keywords: ['list', '箇条書き'], run: () => replaceCurrentBlockWithList(false) },
  { id: 'numbers', group: 'text', label: 'toolbarOrderedList', icon: '1.', detail: 'Make a numbered list', keywords: ['numbered', '番号'], run: () => replaceCurrentBlockWithList(true) },
  { id: 'table', group: 'insert', label: 'toolbarTable', icon: '| |', detail: 'Insert a two-column table', keywords: ['table', '表'], run: insertTable },
  { id: 'callout', group: 'insert', label: 'toolbarCallout', icon: '!', detail: 'Insert a highlighted note block', keywords: ['callout', 'note', 'メモ'], run: insertCallout },
  { id: 'event', group: 'insert', label: 'toolbarEvent', icon: 'Cal', detail: 'Insert an event card block', keywords: ['event', 'calendar', '予定'], run: () => insertMarkdownSnippet(eventSnippet()) },
  { id: 'stream', group: 'insert', label: 'toolbarStream', icon: 'Live', detail: 'Insert a stream schedule block', keywords: ['stream', 'live', '配信'], run: () => insertMarkdownSnippet(streamSnippet()) },
  { id: 'youtube', group: 'insert', label: 'toolbarYouTube', icon: 'YT', detail: 'Insert a click-to-load YouTube embed', keywords: ['youtube', 'video', '動画'], run: () => insertMarkdownSnippet(youtubeSnippet()) },
  { id: 'twitch', group: 'insert', label: 'toolbarTwitch', icon: 'Tw', detail: 'Insert a click-to-load Twitch embed', keywords: ['twitch', 'stream', 'clip'], run: () => insertMarkdownSnippet(twitchSnippet()) },
  { id: 'infobox', group: 'insert', label: 'toolbarInfobox', icon: 'ID', detail: 'Insert a profile or info card', keywords: ['infobox', 'profile'], run: () => insertMarkdownSnippet(infoboxSnippet()) },
  { id: 'embed', group: 'insert', label: 'toolbarEmbed', icon: '<>', detail: 'Insert a rich link card', keywords: ['embed', 'bookmark'], run: () => insertMarkdownSnippet(embedSnippet()) },
  { id: 'links', group: 'insert', label: 'toolbarLinks', icon: '@', detail: 'Insert social/link buttons', keywords: ['links', 'social'], run: () => insertMarkdownSnippet(linksSnippet()) },
  { id: 'image', group: 'media', label: 'toolbarImage', icon: 'Img', detail: 'Upload and insert an image', keywords: ['image', 'upload', '画像'], run: chooseImage },
  { id: 'assets', group: 'media', label: 'toolbarAssets', icon: 'Lib', detail: 'Browse uploaded assets', keywords: ['asset', 'file', '添付'], run: () => { showAssets.value = true } },
]

const visibleSlashActions = (): VisualAction[] => {
  const query = slashQuery.value.toLowerCase()
  return visualActions.filter((action) => {
    const label = t(action.label).toLowerCase()
    return !query || label.includes(query) || action.id.includes(query) || action.keywords.some((keyword) => keyword.toLowerCase().includes(query))
  })
}

function removeSlashTrigger(): void {
  const selection = window.getSelection()
  const node = selection?.anchorNode
  if (!selection || !node || node.nodeType !== Node.TEXT_NODE) return
  const offset = selection.anchorOffset
  const text = node.textContent ?? ''
  const match = text.slice(0, offset).match(/\/[\p{L}\p{N}_-]*$/u)
  if (!match) return
  const range = document.createRange()
  range.setStart(node, offset - match[0].length)
  range.setEnd(node, offset)
  range.deleteContents()
  selection.removeAllRanges()
  selection.addRange(range)
}

function updateSlashMenu(): void {
  const root = editor.value
  const selection = window.getSelection()
  if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode)) {
    slashMenuOpen.value = false
    return
  }
  const node = selection.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    slashMenuOpen.value = false
    return
  }
  const before = (node.textContent ?? '').slice(0, selection.anchorOffset)
  const match = before.match(/(?:^|\n)\s*\/([\p{L}\p{N}_-]*)$/u)
  slashMenuOpen.value = Boolean(match)
  slashQuery.value = match?.[1] ?? ''
}

function runSlashAction(action: VisualAction): void {
  removeSlashTrigger()
  slashMenuOpen.value = false
  action.run()
}

function onEditorInput(): void {
  syncFromDom()
  updateSlashMenu()
}

function saveImageInsertRange(): void {
  const root = editor.value
  const selection = window.getSelection()
  if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode)) {
    savedImageInsertRange = null
    return
  }
  savedImageInsertRange = selection.getRangeAt(0).cloneRange()
}

function restoreImageInsertRange(): void {
  if (!savedImageInsertRange || !editor.value?.contains(savedImageInsertRange.commonAncestorContainer)) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(savedImageInsertRange)
  savedImageInsertRange = null
}

function insertImage(url: string, alt: string): void {
  restoreImageInsertRange()
  insertHtml(`<p><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" /></p><p><br></p>`)
}

function onPaste(event: ClipboardEvent): void {
  if (handleImagePaste(event)) return
  const url = clipboardHttpUrl(event.clipboardData)
  if (!url) return
  event.preventDefault()
  void insertPendingLinkPreview(url)
}

function onDrop(event: DragEvent): void {
  handleImageDrop(event)
}

function insertAsset(markdown: string): void {
  insertHtml(markdownToEditableHtml(markdown))
  showAssets.value = false
}

onMounted(() => {
  renderFromMarkdown(props.modelValue)
})

watch(
  () => props.modelValue,
  async (value) => {
    if (value === lastEmitted || value === currentMarkdown()) return
    await nextTick()
    renderFromMarkdown(value)
  },
)
</script>

<template>
  <div class="space-y-3">
    <EditorToolbar
      :actions="visualActions"
      :busy-id="uploading ? 'image' : undefined"
      :disabled-ids="uploading || pendingImageFiles.length ? ['image'] : []"
    >
      <input ref="uploadInput" class="hidden" type="file" accept="image/*" multiple aria-label="Upload image files" @change="onImageInput" />
    </EditorToolbar>
    <p class="text-xs text-[var(--c-text-muted)]">{{ t('insertMenuHint') }}</p>
    <p v-if="uploadError" class="text-sm text-red-600">{{ uploadError }}</p>
    <div v-if="slashMenuOpen" class="slash-menu">
      <button
        v-for="action in visibleSlashActions()"
        :key="action.id"
        class="slash-menu-button"
        type="button"
        @mousedown.prevent
        @click="runSlashAction(action)"
      >
        <span>
          <span class="mr-2 font-semibold">{{ action.icon }}</span>
          {{ t(action.label) }}
        </span>
        <span class="text-xs text-[var(--c-text-muted)]">{{ action.detail }}</span>
      </button>
    </div>
    <div
      ref="editor"
      class="visual-editor prose dark:prose-invert max-w-none min-h-[60vh] rounded-lg border border-gray-200 bg-white p-5 outline-none dark:border-gray-800 dark:bg-gray-900"
      contenteditable="true"
      spellcheck="true"
      @input="onEditorInput"
      @keyup="updateSlashMenu"
      @paste="onPaste"
      @drop="onDrop"
    ></div>
    <AssetPicker :open="showAssets" :folder="props.assetFolder" @close="showAssets = false" @insert="insertAsset" />
    <ImageUploadDialog
      :open="pendingImageFiles.length > 0"
      :files="pendingImageFiles"
      @cancel="cancelImageUpload"
      @complete="uploadPreparedImages"
    />
  </div>
</template>
