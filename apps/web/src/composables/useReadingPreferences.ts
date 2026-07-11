import { ref } from 'vue'
import { readMigratedStorage, writeStorage } from '@/lib/storage'

export type ReadingWidth = 'comfortable' | 'wide'
export type ReadingFontSize = 'small' | 'medium' | 'large'

const WIDTH_KEY = 'kawaii-wiki.ts:reading-width'
const FONT_KEY = 'kawaii-wiki.ts:reading-font-size'

const storedWidth = readMigratedStorage(WIDTH_KEY, ['ts-wiki:reading-width'])
const storedFont = readMigratedStorage(FONT_KEY, ['ts-wiki:reading-font-size'])
const width = ref<ReadingWidth>(storedWidth === 'wide' ? 'wide' : 'comfortable')
const fontSize = ref<ReadingFontSize>(storedFont === 'small' || storedFont === 'large' ? storedFont : 'medium')

export const useReadingPreferences = () => ({
  width,
  fontSize,
  setWidth(next: ReadingWidth) {
    width.value = next
    writeStorage(WIDTH_KEY, next)
  },
  setFontSize(next: ReadingFontSize) {
    fontSize.value = next
    writeStorage(FONT_KEY, next)
  },
})
