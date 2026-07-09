export interface ImageCropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageBounds {
  width: number
  height: number
}

export interface ImageResizeLimits {
  maxWidth?: number
  maxHeight?: number
}

export interface ImageEditOptions {
  crop: ImageCropRect
  output: ImageBounds
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const positiveInteger = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : fallback

export const imageFiles = (files: FileList | readonly File[] | null | undefined): File[] =>
  Array.from(files ?? []).filter((file) => file.type.startsWith('image/'))

export const clipboardImageFiles = (data: DataTransfer | null): File[] =>
  Array.from(data?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && file.type.startsWith('image/')))

export const normalizeCropRect = (crop: ImageCropRect, bounds: ImageBounds): ImageCropRect => {
  const imageWidth = positiveInteger(bounds.width, 1)
  const imageHeight = positiveInteger(bounds.height, 1)
  const x = clamp(Math.round(crop.x), 0, imageWidth - 1)
  const y = clamp(Math.round(crop.y), 0, imageHeight - 1)
  const width = clamp(Math.round(crop.width), 1, imageWidth - x)
  const height = clamp(Math.round(crop.height), 1, imageHeight - y)
  return { x, y, width, height }
}

export const fullImageCrop = (bounds: ImageBounds): ImageCropRect =>
  normalizeCropRect({ x: 0, y: 0, width: bounds.width, height: bounds.height }, bounds)

export const centeredSquareCrop = (bounds: ImageBounds): ImageCropRect => {
  const imageWidth = positiveInteger(bounds.width, 1)
  const imageHeight = positiveInteger(bounds.height, 1)
  const size = Math.min(imageWidth, imageHeight)
  return {
    x: Math.round((imageWidth - size) / 2),
    y: Math.round((imageHeight - size) / 2),
    width: size,
    height: size,
  }
}

export const fitResize = (crop: ImageCropRect, resize: ImageResizeLimits = {}): ImageBounds => {
  const width = positiveInteger(crop.width, 1)
  const height = positiveInteger(crop.height, 1)
  const maxWidth = resize.maxWidth && resize.maxWidth > 0 ? Math.round(resize.maxWidth) : width
  const maxHeight = resize.maxHeight && resize.maxHeight > 0 ? Math.round(resize.maxHeight) : height
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

const OUTPUT_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

export const imageMimeForOutput = (mime: string): string =>
  Object.hasOwn(OUTPUT_EXTENSIONS, mime) ? mime : 'image/png'

export const editedImageFileName = (filename: string, mime: string): string => {
  const extension = OUTPUT_EXTENSIONS[mime] ?? '.png'
  const stem = filename.replace(/\.[^.]*$/, '') || 'image'
  return `${stem}${extension}`
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = (): void => URL.revokeObjectURL(url)
    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('Could not load image'))
    }
    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not render edited image'))
    }, mime, 0.9)
  })

export async function renderEditedImageFile(file: File, options: ImageEditOptions): Promise<File> {
  const image = await loadImage(file)
  const crop = normalizeCropRect(options.crop, {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  })
  const output = {
    width: positiveInteger(options.output.width, crop.width),
    height: positiveInteger(options.output.height, crop.height),
  }
  const canvas = document.createElement('canvas')
  canvas.width = output.width
  canvas.height = output.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image editing is not supported in this browser')
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height)
  const mime = imageMimeForOutput(file.type)
  const blob = await canvasToBlob(canvas, mime)
  return new File([blob], editedImageFileName(file.name, mime), {
    type: mime,
    lastModified: Date.now(),
  })
}
