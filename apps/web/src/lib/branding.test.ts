import { beforeEach, describe, expect, test } from 'vitest'
import { defaultPublicSettings } from '@kawaii-wiki/core'
import type { PublicSettings } from './api'
import { applyBranding } from './branding'

const makeSettings = (overrides: Partial<PublicSettings> = {}): PublicSettings => ({
  ...defaultPublicSettings(),
  siteTitle: 'Docs Wiki',
  accentColor: '#2563eb',
  faviconUrl: '/assets/favicon.png',
  customCss: ':root { --radius: 0.75rem; }',
  customHeadHtml: '<meta name="x-docs" content="ok"><script>window.__tsWikiBranding = true</script>',
  ...overrides,
})

describe('applyBranding', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.title = ''
    delete document.documentElement.dataset.kawaiiWikiMeta
    document.documentElement.removeAttribute('style')
  })

  test('applies accent, title, favicon, custom CSS, and trusted head HTML', () => {
    applyBranding(makeSettings())

    expect(document.documentElement.style.getPropertyValue('--c-accent')).toBe('#2563eb')
    expect(document.title).toBe('Docs Wiki')
    expect(document.querySelector<HTMLLinkElement>('#kawaii-wiki-favicon')?.getAttribute('href')).toBe('/assets/favicon.png')
    expect(document.querySelector<HTMLStyleElement>('#kawaii-wiki-custom-css')?.textContent).toContain('--radius')
    expect(document.querySelector<HTMLMetaElement>('meta[name="x-docs"]')?.content).toBe('ok')
    expect(document.querySelector<HTMLScriptElement>('script[data-kawaii-wiki-custom-head]')?.textContent).toContain('__tsWikiBranding')
  })

  test('removes old favicon and custom head nodes when settings are cleared', () => {
    applyBranding(makeSettings())
    applyBranding(makeSettings({ faviconUrl: '', customCss: '', customHeadHtml: '' }))

    expect(document.querySelector('#kawaii-wiki-favicon')).toBeNull()
    expect(document.querySelector('#kawaii-wiki-custom-css')).toBeNull()
    expect(document.querySelector('[data-kawaii-wiki-custom-head]')).toBeNull()
  })

  test('does not replace page-specific titles', () => {
    document.documentElement.dataset.kawaiiWikiMeta = 'page'
    document.title = 'Page · Docs Wiki'

    applyBranding(makeSettings({ siteTitle: 'Other Wiki' }))

    expect(document.title).toBe('Page · Docs Wiki')
  })
})
