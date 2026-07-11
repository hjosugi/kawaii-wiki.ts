const add = (items: string[], value: string): void => {
  if (!items.includes(value)) items.push(value)
}
/** Markdown constructs intentionally kept as raw blocks by the visual editor. */
export const unsupportedVisualMarkdownFeatures = (markdown: string): string[] => {
  const features: string[] = []
  const normalized = markdown.replace(/\r\n?/g, '\n')
  const fences = [...normalized.matchAll(/^```([^\s`]*)/gm)]
    .map((match) => (match[1] ?? '').toLowerCase())
    .filter((name) => name && name !== 'callout')
  if (fences.length) add(features, `fenced blocks (${[...new Set(fences)].join(', ')})`)
  if (/^\s+(?:[-*+] |\d+[.)] )/m.test(normalized)) add(features, 'nested lists')
  if (/^>\s?/m.test(normalized)) add(features, 'block quotes')
  if (/^(?: {4}|\t)\S/m.test(normalized)) add(features, 'indented code')
  if (/^(?:---+|\*\*\*+|___+)\s*$/m.test(normalized)) add(features, 'horizontal rules')
  if (/\[\^[^\]]+\]|^\[\^[^\]]+\]:/m.test(normalized)) add(features, 'footnotes')
  if (/^- \[[ xX]\]\s/m.test(normalized)) add(features, 'task lists')
  if (/\[\[[^\]]+\]\]/.test(normalized)) add(features, 'wiki links')
  return features
}
