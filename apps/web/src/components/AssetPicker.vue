<script setup lang="ts">
import { friendlyError } from '@/lib/friendlyErrors'
import { ref, watch } from 'vue'
import { Api, type AssetView } from '@/lib/api'
import { displayAssetFolder } from '@/lib/assets'
import ModalDialog from '@/components/ModalDialog.vue'
import Skeleton from '@/components/Skeleton.vue'
import { useI18n } from '@/lib/i18n'

const props = defineProps<{ open: boolean; folder?: string }>()
const emit = defineEmits<{
  close: []
  insert: [markdown: string]
}>()
const { t } = useI18n()

const assets = ref<AssetView[]>([])
const folders = ref<string[]>([])
const folderFilter = ref('')
const query = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const uploading = ref(false)
const error = ref<string | null>(null)

const altText = (filename: string): string => filename.replace(/\.[^.]+$/, '') || 'image'

async function load(): Promise<void> {
  if (!props.open) return
  loading.value = true
  error.value = null
  try {
    const [nextAssets, nextFolders] = await Promise.all([
      Api.listAssets(folderFilter.value || undefined, query.value || undefined),
      Api.assetFolders(),
    ])
    assets.value = nextAssets
    folders.value = nextFolders
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    loading.value = false
  }
}

async function uploadFiles(files: FileList | null): Promise<void> {
  if (!files?.length) return
  uploading.value = true
  error.value = null
  try {
    for (const file of Array.from(files)) {
      await Api.uploadAsset(file, folderFilter.value || undefined)
    }
    await load()
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    uploading.value = false
    if (uploadInput.value) uploadInput.value.value = ''
  }
}

async function renameAsset(asset: AssetView, filename: string): Promise<void> {
  filename = filename.trim()
  if (!filename || filename === asset.filename) return
  error.value = null
  try {
    const renamed = await Api.renameAsset(asset.id, filename)
    assets.value = assets.value.map((item) => (item.id === renamed.id ? renamed : item))
  } catch (e) {
    error.value = friendlyError(e)
  }
}

function insert(asset: AssetView): void {
  const label = altText(asset.filename)
  emit('insert', asset.mime.startsWith('image/') ? `![${label}](${asset.url})\n` : `[${asset.filename}](${asset.url})\n`)
}

watch(() => props.open, (open) => {
  if (!open) return
  folderFilter.value = props.folder ?? ''
  void load()
}, { immediate: true })

watch(() => props.folder, (folder) => {
  if (!props.open) return
  folderFilter.value = folder ?? ''
  void load()
})
</script>

<template>
  <ModalDialog
    :open="open"
    :title="t('assets')"
    container-class="items-center justify-center p-4"
    panel-class="w-full max-w-4xl max-h-[84vh] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
    @close="emit('close')"
  >
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div class="min-w-0">
          <h2 class="font-semibold">{{ t('assets') }}</h2>
          <div class="text-xs text-gray-500">{{ displayAssetFolder(folderFilter) }}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model.trim="folderFilter"
            class="input h-9 w-48 text-sm"
            list="asset-picker-folders"
            :placeholder="t('folder')"
            :aria-label="t('assetFolder')"
            @change="load"
          />
          <input
            v-model.trim="query"
            class="input h-9 w-48 text-sm"
            :placeholder="t('searchFiles')"
            :aria-label="t('searchFiles')"
            @input="load"
          />
          <datalist id="asset-picker-folders">
            <option value="" label="Root"></option>
            <option v-for="folder in folders" :key="folder" :value="folder"></option>
          </datalist>
          <button class="btn-ghost" type="button" :disabled="uploading" @click="uploadInput?.click()">
            {{ uploading ? 'Uploading...' : 'Upload' }}
          </button>
          <button class="btn-ghost" type="button" @click="emit('close')">{{ t('close') }}</button>
        </div>
        <input
          ref="uploadInput"
          class="hidden"
          type="file"
          aria-label="Upload assets"
          multiple
          accept="image/*,.pdf,.txt,.md,.csv,.json,.zip,.docx,.xlsx,.pptx,.odt,.ods,.odp"
          @change="uploadFiles(($event.target as HTMLInputElement).files)"
        />
      </div>

      <div class="max-h-[calc(84vh-4.5rem)] overflow-auto p-4">
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <Skeleton v-else-if="loading" label="Loading assets" :lines="4" />
        <p v-else-if="!assets.length" class="text-gray-500">{{ t('noAssetsInFolder') }}</p>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="asset in assets"
            :key="asset.id"
            class="rounded-md border border-gray-200 p-3 dark:border-gray-800"
          >
            <img
              v-if="asset.mime.startsWith('image/')"
              :src="asset.thumbUrl || asset.url"
              :alt="asset.filename"
              class="mb-2 h-28 w-full rounded object-contain bg-gray-100 dark:bg-gray-900"
            />
            <input
              class="input w-full text-sm font-medium"
              :value="asset.filename"
              @change="renameAsset(asset, ($event.target as HTMLInputElement).value)"
            />
            <div class="mt-1 truncate text-xs text-gray-500">{{ displayAssetFolder(asset.folder) }}</div>
            <div class="mt-1 truncate font-mono text-xs text-gray-500">{{ asset.url }}</div>
            <button class="btn-ghost mt-2 w-full" type="button" @click="insert(asset)">{{ t('insert') }}</button>
          </div>
        </div>
      </div>
  </ModalDialog>
</template>
