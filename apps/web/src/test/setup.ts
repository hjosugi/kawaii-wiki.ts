import { afterEach } from 'vitest'

afterEach(() => {
  globalThis.window?.localStorage?.clear()
  delete globalThis.document?.documentElement.dataset.tsWikiMeta
})
