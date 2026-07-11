import type { Page } from './api'

const fallbackSiteName = 'kawaii-wiki.ts'

const absoluteUrl = (value: string): string => {
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return value
  }
}

const currentSiteName = (): string =>
  document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content.trim()
    || fallbackSiteName

const upsertMeta = (selector: string, attrs: Record<string, string>): void => {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    if (attrs.name) element.setAttribute('name', attrs.name)
    if (attrs.property) element.setAttribute('property', attrs.property)
    document.head.append(element)
  }
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value)
  }
}

const removeMeta = (selector: string): void => {
  document.head.querySelector(selector)?.remove()
}

export const firstImageUrlFromHtml = (html: string): string | null => {
  const container = document.createElement('div')
  container.innerHTML = html
  const src = container.querySelector('img')?.getAttribute('src')?.trim()
  return src ? absoluteUrl(src) : null
}

export const setPageMeta = (page: Page): void => {
  const siteName = currentSiteName()
  const pageTitle = page.icon ? `${page.icon} ${page.title}` : page.title
  const title = `${pageTitle} · ${siteName}`
  const description = page.description.trim() || siteName
  const url = absoluteUrl(`/${page.path}`)
  const image = page.coverUrl ? absoluteUrl(page.coverUrl) : firstImageUrlFromHtml(page.renderedHtml)

  document.documentElement.dataset.tsWikiMeta = 'page'
  document.title = title
  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: siteName })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })

  if (image) {
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image })
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image })
  } else {
    removeMeta('meta[property="og:image"]')
    removeMeta('meta[name="twitter:image"]')
  }
}
