import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import ImageUploadDialog from './ImageUploadDialog.vue'

const imageFile = (): File => new File(['image'], 'cover.png', { type: 'image/png' })

const buttonNamed = (name: string): HTMLButtonElement => {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === name)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`)
  return button
}

describe('ImageUploadDialog', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('Image', class {
      naturalWidth = 640
      naturalHeight = 480
      width = 640
      height = 480
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  test('uploads the original file without editing', async () => {
    const file = imageFile()
    const wrapper = mount(ImageUploadDialog, {
      attachTo: document.body,
      props: { open: true, files: [file] },
    })

    await vi.waitFor(() => expect(document.body.textContent).toContain('Output 640 x 480'))
    buttonNamed('Upload original').click()

    expect(wrapper.emitted('complete')?.[0]?.[0]).toEqual([file])
  })

  test('cancels without returning files', async () => {
    const wrapper = mount(ImageUploadDialog, {
      attachTo: document.body,
      props: { open: true, files: [imageFile()] },
    })

    await vi.waitFor(() => expect(document.body.textContent).toContain('Prepare image upload'))
    buttonNamed('Cancel').click()

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('complete')).toBeUndefined()
  })
})
