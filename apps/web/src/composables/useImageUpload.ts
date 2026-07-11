import { ref } from 'vue'
import { Api, type AssetUpload } from '@/lib/api'
import { clipboardImageFiles, imageFiles } from '@/lib/imageUpload'

export interface ImageUploadOptions {
  readonly folder?: () => string | undefined
  readonly insert: (asset: AssetUpload, alt: string) => void | Promise<void>
  readonly beforePrepare?: () => void
  readonly afterCancel?: () => void
}

export const useImageUpload = (options: ImageUploadOptions) => {
  const uploading = ref(false)
  const uploadError = ref<string | null>(null)
  const pendingImageFiles = ref<File[]>([])

  const prepareImageUpload = (files: readonly File[]): void => {
    if (!files.length || uploading.value) return
    uploadError.value = null
    options.beforePrepare?.()
    pendingImageFiles.value = [...files]
  }

  const cancelImageUpload = (): void => {
    pendingImageFiles.value = []
    options.afterCancel?.()
  }

  const uploadPreparedImages = async (files: File[]): Promise<void> => {
    pendingImageFiles.value = []
    if (!files.length) return
    uploadError.value = null
    uploading.value = true
    try {
      for (const file of files) {
        const asset = await Api.uploadAsset(file, options.folder?.())
        const alt = asset.filename.replace(/\.[^.]+$/, '') || 'image'
        await options.insert(asset, alt)
      }
    } catch (error) {
      uploadError.value = error instanceof Error ? error.message : String(error)
    } finally {
      uploading.value = false
    }
  }

  const onImageInput = (event: Event): void => {
    const input = event.target as HTMLInputElement
    prepareImageUpload(imageFiles(input.files))
    input.value = ''
  }

  const handleImagePaste = (event: ClipboardEvent): boolean => {
    const files = clipboardImageFiles(event.clipboardData)
    if (!files.length) return false
    event.preventDefault()
    prepareImageUpload(files)
    return true
  }

  const handleImageDrop = (event: DragEvent): boolean => {
    const files = imageFiles(event.dataTransfer?.files)
    if (!files.length) return false
    event.preventDefault()
    prepareImageUpload(files)
    return true
  }

  return {
    uploading,
    uploadError,
    pendingImageFiles,
    prepareImageUpload,
    cancelImageUpload,
    uploadPreparedImages,
    onImageInput,
    handleImagePaste,
    handleImageDrop,
  }
}
