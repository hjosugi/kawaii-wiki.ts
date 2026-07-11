const storageOrNull = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
/** Read a renamed local value once, copying it into the new namespace. */
export const readMigratedStorage = (key: string, legacyKeys: readonly string[] = []): string | null => {
  const storage = storageOrNull()
  if (!storage) return null
  const current = storage.getItem(key)
  if (current !== null) return current
  for (const legacyKey of legacyKeys) {
    const legacy = storage.getItem(legacyKey)
    if (legacy === null) continue
    storage.setItem(key, legacy)
    storage.removeItem(legacyKey)
    return legacy
  }
  return null
}

export const writeStorage = (key: string, value: string): void => {
  storageOrNull()?.setItem(key, value)
}
