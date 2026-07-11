import type { PublicSettings } from './api'

const customCssId = 'kawaii-wiki-custom-css'
const customHeadId = 'kawaii-wiki-custom-head'
const iconId = 'kawaii-wiki-favicon'

const safeUrl = (value: string): string => value.replace(/["\\\n\r]/g, encodeURIComponent)

const backgroundCss = (settings: PublicSettings): string => {
  const background = settings.background
  if (!background || background.type === 'none' || !background.value) return 'var(--c-bg)'
  if (background.type === 'color' && /^#[0-9a-f]{6}$/i.test(background.value)) return background.value
  if (background.type === 'image') return `url("${safeUrl(background.value)}")`
  if (background.type === 'gradient' && !/(url|expression|;)/i.test(background.value)) return background.value
  if (background.type === 'pattern') {
    if (background.value === 'dots') {
      return 'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--c-accent) 28%, transparent) 1px, transparent 0)'
    }
    if (background.value === 'grid') {
      return 'linear-gradient(color-mix(in srgb, var(--c-border) 64%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--c-border) 64%, transparent) 1px, transparent 1px)'
    }
    if (background.value === 'stars') {
      return 'radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--c-accent) 45%, transparent) 1px, transparent 2px), radial-gradient(circle at 80% 30%, color-mix(in srgb, #f59e0b 55%, transparent) 1px, transparent 2px), radial-gradient(circle at 45% 75%, color-mix(in srgb, #06b6d4 45%, transparent) 1px, transparent 2px)'
    }
    if (background.value === 'diagonal') {
      return 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--c-accent) 10%, transparent) 0 1px, transparent 1px 18px)'
    }
  }
  return 'var(--c-bg)'
}

const backgroundSize = (settings: PublicSettings): string => {
  const background = settings.background
  if (background?.type === 'image') return 'cover'
  if (background?.type === 'pattern') return background.value === 'grid' ? '32px 32px' : '28px 28px'
  return 'auto'
}

const setTextElement = (id: string, tag: 'style' | 'template', value: string): HTMLElement | null => {
  const existing = document.getElementById(id)
  if (!value) {
    existing?.remove()
    return null
  }
  const element = existing ?? document.createElement(tag)
  element.id = id
  element.textContent = value
  if (!existing) document.head.appendChild(element)
  return element
}

const applyHeadHtml = (html: string): void => {
  document.querySelectorAll('[data-kawaii-wiki-custom-head]').forEach((node) => node.remove())
  if (!html.trim()) return
  const template = document.createElement('template')
  template.innerHTML = html
  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const element = node as HTMLElement
    if (element.tagName.toLowerCase() === 'script') {
      const script = document.createElement('script')
      for (const attr of Array.from(element.attributes)) script.setAttribute(attr.name, attr.value)
      script.textContent = element.textContent
      script.dataset.kawaiiWikiCustomHead = 'true'
      document.head.appendChild(script)
    } else {
      element.dataset.kawaiiWikiCustomHead = 'true'
      document.head.appendChild(element)
    }
  }
}

const applyFavicon = (href: string): void => {
  const existing = document.getElementById(iconId) as HTMLLinkElement | null
  if (!href) {
    existing?.remove()
    return
  }
  const link = existing ?? document.createElement('link')
  link.id = iconId
  link.rel = 'icon'
  link.href = href
  if (!existing) document.head.appendChild(link)
}

export const applyBranding = (settings: PublicSettings): void => {
  document.documentElement.style.setProperty('--accent', settings.accentColor)
  document.documentElement.style.setProperty('--c-accent', settings.accentColor)
  document.documentElement.style.setProperty('--site-background', backgroundCss(settings))
  document.documentElement.style.setProperty('--site-background-size', backgroundSize(settings))
  document.documentElement.style.setProperty('--site-background-overlay-opacity', String(settings.background?.overlayOpacity ?? 0))
  document.documentElement.dataset.themePreset = settings.themePreset
  document.documentElement.dataset.fontFamily = settings.fontFamily
  if (document.documentElement.dataset.kawaiiWikiMeta !== 'page') {
    document.title = settings.siteTitle
  }
  applyFavicon(settings.faviconUrl)
  setTextElement(customCssId, 'style', settings.customCss)
  setTextElement(customHeadId, 'template', '')
  applyHeadHtml(settings.customHeadHtml)
}
