export const isApplePlatform = (): boolean =>
  typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '')

export const modifierKeyLabel = (): '⌘' | 'Ctrl' => isApplePlatform() ? '⌘' : 'Ctrl'

export const shortcutLabel = (key: string): string => `${modifierKeyLabel()}${modifierKeyLabel() === '⌘' ? '' : ' '}${key}`
