import { afterEach } from 'vitest'

afterEach(() => {
  globalThis.window?.localStorage?.clear()
})
