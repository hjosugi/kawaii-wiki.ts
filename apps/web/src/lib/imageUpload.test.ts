import { describe, expect, test } from 'vitest'
import {
  centeredSquareCrop,
  clipboardImageFiles,
  editedImageFileName,
  fitResize,
  imageFiles,
  imageMimeForOutput,
  normalizeCropRect,
} from './imageUpload'

describe('imageUpload', () => {
  test('filters image files from inputs and clipboard items', () => {
    const png = new File(['png'], 'one.png', { type: 'image/png' })
    const text = new File(['txt'], 'note.txt', { type: 'text/plain' })
    const jpeg = new File(['jpg'], 'two.jpg', { type: 'image/jpeg' })

    expect(imageFiles([png, text, jpeg])).toEqual([png, jpeg])

    const clipboard = {
      items: [
        { kind: 'file', getAsFile: () => png },
        { kind: 'file', getAsFile: () => text },
        { kind: 'string', getAsFile: () => null },
      ],
    } as unknown as DataTransfer
    expect(clipboardImageFiles(clipboard)).toEqual([png])
  })

  test('normalizes crop rectangles within the source image bounds', () => {
    expect(normalizeCropRect({ x: -10, y: 20, width: 500, height: 0 }, { width: 320, height: 240 })).toEqual({
      x: 0,
      y: 20,
      width: 320,
      height: 1,
    })
    expect(centeredSquareCrop({ width: 400, height: 240 })).toEqual({
      x: 80,
      y: 0,
      width: 240,
      height: 240,
    })
  })

  test('fits resized output inside optional max dimensions without enlarging', () => {
    expect(fitResize({ x: 0, y: 0, width: 1600, height: 900 }, { maxWidth: 800 })).toEqual({
      width: 800,
      height: 450,
    })
    expect(fitResize({ x: 0, y: 0, width: 800, height: 1200 }, { maxWidth: 600, maxHeight: 600 })).toEqual({
      width: 400,
      height: 600,
    })
    expect(fitResize({ x: 0, y: 0, width: 320, height: 200 }, { maxWidth: 1000 })).toEqual({
      width: 320,
      height: 200,
    })
  })

  test('chooses browser canvas output names and MIME types', () => {
    expect(imageMimeForOutput('image/jpeg')).toBe('image/jpeg')
    expect(imageMimeForOutput('image/gif')).toBe('image/png')
    expect(editedImageFileName('cover.gif', 'image/png')).toBe('cover.png')
    expect(editedImageFileName('', 'image/jpeg')).toBe('image.jpg')
  })
})
