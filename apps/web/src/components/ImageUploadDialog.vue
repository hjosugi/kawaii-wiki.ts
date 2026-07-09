<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import ModalDialog from '@/components/ModalDialog.vue'
import {
  centeredSquareCrop,
  fitResize,
  fullImageCrop,
  normalizeCropRect,
  renderEditedImageFile,
  type ImageCropRect,
} from '@/lib/imageUpload'

const props = defineProps<{
  open: boolean
  files: readonly File[]
}>()

const emit = defineEmits<{
  cancel: []
  complete: [files: File[]]
}>()

const index = ref(0)
const prepared = ref<File[]>([])
const sourceUrl = ref<string | null>(null)
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const loading = ref(false)
const processing = ref(false)
const error = ref<string | null>(null)
const maxWidthInput = ref('')
const maxHeightInput = ref('')
const crop = reactive<ImageCropRect>({ x: 0, y: 0, width: 1, height: 1 })

const currentFile = computed(() => props.files[index.value] ?? null)
const currentBounds = computed(() => ({ width: naturalWidth.value || 1, height: naturalHeight.value || 1 }))
const currentCrop = computed(() => normalizeCropRect(crop, currentBounds.value))
const outputSize = computed(() =>
  fitResize(currentCrop.value, {
    maxWidth: positiveIntegerFromInput(maxWidthInput.value),
    maxHeight: positiveIntegerFromInput(maxHeightInput.value),
  }),
)
const progressLabel = computed(() => `${Math.min(index.value + 1, Math.max(props.files.length, 1))} of ${Math.max(props.files.length, 1)}`)
const canApply = computed(() => Boolean(currentFile.value && naturalWidth.value && naturalHeight.value && !loading.value && !processing.value))
const cropStyle = computed(() => {
  const bounds = currentBounds.value
  const rect = currentCrop.value
  return {
    left: `${(rect.x / bounds.width) * 100}%`,
    top: `${(rect.y / bounds.height) * 100}%`,
    width: `${(rect.width / bounds.width) * 100}%`,
    height: `${(rect.height / bounds.height) * 100}%`,
    boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.45)',
  }
})

function positiveIntegerFromInput(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function revokeSourceUrl(): void {
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value)
  sourceUrl.value = null
}

function assignCrop(next: ImageCropRect): void {
  const rect = normalizeCropRect(next, currentBounds.value)
  crop.x = rect.x
  crop.y = rect.y
  crop.width = rect.width
  crop.height = rect.height
}

function resetCrop(): void {
  assignCrop(fullImageCrop(currentBounds.value))
}

function squareCrop(): void {
  assignCrop(centeredSquareCrop(currentBounds.value))
}

function setCropField(field: keyof ImageCropRect, value: string): void {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return
  assignCrop({ ...currentCrop.value, [field]: Math.round(parsed) })
}

function setResizeInput(kind: 'width' | 'height', value: string): void {
  const normalized = value.replace(/[^\d]/g, '')
  if (kind === 'width') maxWidthInput.value = normalized
  else maxHeightInput.value = normalized
}

function loadCurrentFile(): void {
  revokeSourceUrl()
  error.value = null
  naturalWidth.value = 0
  naturalHeight.value = 0
  maxWidthInput.value = ''
  maxHeightInput.value = ''
  const file = currentFile.value
  if (!props.open || !file) return

  loading.value = true
  const url = URL.createObjectURL(file)
  sourceUrl.value = url
  const image = new Image()
  image.onload = () => {
    if (sourceUrl.value !== url) return
    naturalWidth.value = image.naturalWidth || image.width || 1
    naturalHeight.value = image.naturalHeight || image.height || 1
    resetCrop()
    loading.value = false
  }
  image.onerror = () => {
    if (sourceUrl.value !== url) return
    error.value = 'Could not load this image for editing. You can still upload the original.'
    loading.value = false
  }
  image.src = url
}

function advance(file: File): void {
  prepared.value.push(file)
  if (index.value + 1 >= props.files.length) {
    emit('complete', [...prepared.value])
    return
  }
  index.value += 1
  loadCurrentFile()
}

function uploadOriginal(): void {
  const file = currentFile.value
  if (!file || processing.value) return
  advance(file)
}

async function applyChanges(): Promise<void> {
  const file = currentFile.value
  if (!file || !canApply.value) return
  processing.value = true
  error.value = null
  try {
    const edited = await renderEditedImageFile(file, {
      crop: currentCrop.value,
      output: outputSize.value,
    })
    advance(edited)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    processing.value = false
  }
}

function cancel(): void {
  if (processing.value) return
  emit('cancel')
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      revokeSourceUrl()
      return
    }
    index.value = 0
    prepared.value = []
    loadCurrentFile()
  },
  { immediate: true },
)

watch(
  () => props.files,
  () => {
    if (!props.open) return
    index.value = 0
    prepared.value = []
    loadCurrentFile()
  },
)

onBeforeUnmount(revokeSourceUrl)
</script>

<template>
  <ModalDialog
    :open="open"
    title="Prepare image upload"
    container-class="items-center justify-center p-4"
    panel-class="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
    @close="cancel"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
      <div class="min-w-0">
        <h2 class="font-semibold">Prepare image upload</h2>
        <div v-if="currentFile" class="truncate text-xs text-gray-500">
          {{ currentFile.name }} - {{ formatBytes(currentFile.size) }} - {{ progressLabel }}
        </div>
      </div>
      <button class="btn-ghost" type="button" :disabled="processing" @click="cancel">Close</button>
    </div>

    <div class="grid max-h-[calc(90vh-8.5rem)] grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="min-h-72 overflow-hidden rounded-md border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
        <div class="flex h-full min-h-72 items-center justify-center p-3">
          <div v-if="sourceUrl" class="relative max-h-[62vh] max-w-full overflow-hidden">
            <img :src="sourceUrl" :alt="currentFile?.name || 'Image preview'" class="block max-h-[62vh] max-w-full object-contain" />
            <div
              v-if="naturalWidth && naturalHeight"
              class="pointer-events-none absolute border-2 border-white ring-1 ring-black/40"
              :style="cropStyle"
            ></div>
          </div>
          <p v-else class="text-sm text-gray-500">No image selected.</p>
        </div>
      </div>

      <div class="space-y-4">
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <p v-else-if="loading" class="text-sm text-gray-500">Loading image...</p>

        <fieldset class="space-y-3" :disabled="!naturalWidth || !naturalHeight || processing">
          <legend class="sr-only">Crop</legend>
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-semibold">Crop</div>
            <div class="flex gap-2">
              <button class="btn-ghost py-1 text-xs" type="button" @click="resetCrop">Reset</button>
              <button class="btn-ghost py-1 text-xs" type="button" @click="squareCrop">Square</button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-gray-500">
              X
              <input class="input mt-1 h-9 text-sm" type="number" min="0" :max="naturalWidth - 1" :value="currentCrop.x" @input="setCropField('x', ($event.target as HTMLInputElement).value)" />
            </label>
            <label class="text-xs text-gray-500">
              Y
              <input class="input mt-1 h-9 text-sm" type="number" min="0" :max="naturalHeight - 1" :value="currentCrop.y" @input="setCropField('y', ($event.target as HTMLInputElement).value)" />
            </label>
            <label class="text-xs text-gray-500">
              Width
              <input class="input mt-1 h-9 text-sm" type="number" min="1" :max="naturalWidth - currentCrop.x" :value="currentCrop.width" @input="setCropField('width', ($event.target as HTMLInputElement).value)" />
            </label>
            <label class="text-xs text-gray-500">
              Height
              <input class="input mt-1 h-9 text-sm" type="number" min="1" :max="naturalHeight - currentCrop.y" :value="currentCrop.height" @input="setCropField('height', ($event.target as HTMLInputElement).value)" />
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-3" :disabled="!naturalWidth || !naturalHeight || processing">
          <legend class="text-sm font-semibold">Resize</legend>
          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-gray-500">
              Max width
              <input class="input mt-1 h-9 text-sm" inputmode="numeric" placeholder="Original" :value="maxWidthInput" @input="setResizeInput('width', ($event.target as HTMLInputElement).value)" />
            </label>
            <label class="text-xs text-gray-500">
              Max height
              <input class="input mt-1 h-9 text-sm" inputmode="numeric" placeholder="Original" :value="maxHeightInput" @input="setResizeInput('height', ($event.target as HTMLInputElement).value)" />
            </label>
          </div>
          <div class="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
            Output {{ outputSize.width }} x {{ outputSize.height }}
          </div>
        </fieldset>
      </div>
    </div>

    <div class="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
      <button class="btn-ghost" type="button" :disabled="processing" @click="cancel">Cancel</button>
      <button class="btn-ghost" type="button" :disabled="processing || !currentFile" @click="uploadOriginal">Upload original</button>
      <button class="btn-primary" type="button" :disabled="!canApply" @click="applyChanges">
        {{ processing ? 'Preparing...' : 'Apply changes' }}
      </button>
    </div>
  </ModalDialog>
</template>
