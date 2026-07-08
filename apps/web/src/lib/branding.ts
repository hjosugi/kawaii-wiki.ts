import type { PublicSettings } from './api'

const customCssId = 'ts-wiki-custom-css'
const customHeadId = 'ts-wiki-custom-head'
const iconId = 'ts-wiki-favicon'

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
  document.querySelectorAll('[data-ts-wiki-custom-head]').forEach((node) => node.remove())
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
      script.dataset.tsWikiCustomHead = 'true'
      document.head.appendChild(script)
    } else {
      element.dataset.tsWikiCustomHead = 'true'
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
  if (document.documentElement.dataset.tsWikiMeta !== 'page') {
    document.title = settings.siteTitle
  }
  applyFavicon(settings.faviconUrl)
  setTextElement(customCssId, 'style', settings.customCss)
  setTextElement(customHeadId, 'template', '')
  applyHeadHtml(settings.customHeadHtml)
}
