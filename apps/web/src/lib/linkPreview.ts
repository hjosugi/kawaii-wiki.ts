import type { LinkPreviewView } from './api'

const flatten = (value: string): string => value.replace(/\r?\n/g, ' ').trim()

const fenceLine = (key: string, value: string | null | undefined): string =>
  value?.trim() ? `${key}: ${flatten(value)}` : ''

export const clipboardHttpUrl = (data: DataTransfer | null): string | null => {
  const text = data?.getData('text/plain')?.trim()
  if (!text || /\s/.test(text)) return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export const markdownLinkForUrl = (url: string): string => `[${url}](${url})`

export const linkPreviewToEmbedFence = (preview: LinkPreviewView): string => {
  const lines = [
    '```embed',
    fenceLine('url', preview.url),
    fenceLine('title', preview.title || preview.url),
    fenceLine('description', preview.description),
    fenceLine('image', preview.image),
    fenceLine('site', preview.siteName),
    fenceLine('author', preview.author),
    fenceLine('provider', preview.provider),
    '```',
  ].filter(Boolean)
  return `${lines.join('\n')}\n`
}
