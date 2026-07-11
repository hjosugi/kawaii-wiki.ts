import { afterEach, describe, expect, test, vi } from 'vitest'
import { Api } from './api'
import { enhanceRenderedMarkdown, rendererForMarkdownFeatures } from './markdownEnhance'

describe('markdown enhancements', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('enhances code blocks and content tabs without duplicating controls', () => {
    const renderer = rendererForMarkdownFeatures({ enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    const root = document.createElement('div')
    root.innerHTML = `${renderer.renderMarkdown(`\`\`\`ts
const x = 1
\`\`\`

\`\`\`tabs
## macOS
Use brew.

## Windows
Use winget.
\`\`\``).html}`

    enhanceRenderedMarkdown(root, { enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    expect(root.querySelectorAll('.wiki-code-copy')).toHaveLength(1)
    expect(root.querySelector('[data-wiki-tabs]')?.getAttribute('data-tabs-enhanced')).toBe('1')
    expect(root.querySelectorAll('[role="tabpanel"]')[0]?.hasAttribute('hidden')).toBe(false)
    expect(root.querySelectorAll('[role="tabpanel"]')[1]?.hasAttribute('hidden')).toBe(true)

    enhanceRenderedMarkdown(root, { enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    expect(root.querySelectorAll('.wiki-code-copy')).toHaveLength(1)
  })

  test('loads YouTube iframes only after media-card activation', () => {
    const renderer = rendererForMarkdownFeatures({ enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    const root = document.createElement('div')
    root.innerHTML = renderer.renderMarkdown(`\`\`\`youtube
id: dQw4w9WgXcQ
title: Demo
\`\`\``).html

    enhanceRenderedMarkdown(root, { enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    expect(root.querySelector('iframe')).toBeNull()
    root.querySelector<HTMLButtonElement>('[data-wiki-media-load]')?.click()
    const frame = root.querySelector<HTMLIFrameElement>('iframe')
    expect(frame?.src).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(frame?.src).toContain('autoplay=1')
  })

  test('hydrates YouTube latest placeholders from the API', async () => {
    vi.spyOn(Api, 'youtubeLatest').mockResolvedValue({
      channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
      videos: [{
        id: 'abc123',
        title: 'Latest stream',
        url: 'https://www.youtube.com/watch?v=abc123',
        author: 'Channel',
        publishedAt: '2026-07-09T12:00:00Z',
        thumbnail: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      }],
      fetchedAt: 1,
      expiresAt: 2,
    })
    const renderer = rendererForMarkdownFeatures({ enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    const root = document.createElement('div')
    root.innerHTML = renderer.renderMarkdown(`\`\`\`youtube-latest
channelId: UCaaaaaaaaaaaaaaaaaaaaaa
limit: 1
\`\`\``).html

    enhanceRenderedMarkdown(root, { enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    await vi.waitFor(() => {
      expect(root.querySelector('.wiki-youtube-latest-title')?.textContent).toBe('Latest stream')
    })
    expect(Api.youtubeLatest).toHaveBeenCalledWith('UCaaaaaaaaaaaaaaaaaaaaaa', 1)
  })

  test('hydrates landing page widgets from the API', async () => {
    vi.spyOn(Api, 'listPages').mockResolvedValue([
      {
        path: 'home',
        title: 'Home',
        description: 'Start page',
        icon: '⭐',
        coverUrl: '',
        coverPosition: 'center',
        lifecycle: 'active',
        status: 'verified',
        labels: [],
        ownerId: null,
        authorId: null,
        reviewAt: null,
        publishAt: null,
        navOrder: null,
        pinned: false,
        spaceKey: 'main',
        locale: 'und',
        updatedAt: 1,
      },
    ])
    vi.spyOn(Api, 'recentChanges').mockResolvedValue([
      { id: 'r1', path: 'home', title: 'Home', action: 'updated', authorId: null, authorName: null, createdAt: 1 },
    ])
    vi.spyOn(Api, 'popularPages').mockResolvedValue([
      {
        path: 'home',
        title: 'Home',
        description: 'Start page',
        icon: '⭐',
        coverUrl: '',
        coverPosition: 'center',
        lifecycle: 'active',
        status: 'verified',
        labels: [],
        ownerId: null,
        authorId: null,
        reviewAt: null,
        publishAt: null,
        navOrder: null,
        pinned: false,
        spaceKey: 'main',
        locale: 'und',
        updatedAt: 1,
        views: 3,
        lastViewedAt: 1,
      },
    ])
    const renderer = rendererForMarkdownFeatures({ enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    const root = document.createElement('div')
    root.innerHTML = renderer.renderMarkdown(`\`\`\`pages
/home
\`\`\`

\`\`\`recent
limit: 1
\`\`\`

\`\`\`popular
days: 7
limit: 1
\`\`\``).html

    enhanceRenderedMarkdown(root, { enableMath: false, enableEmoji: true, enableMermaid: false, defaultLocale: 'und', timezone: 'UTC', dateFormat: 'medium' })
    await vi.waitFor(() => {
      expect(root.querySelectorAll('.wiki-page-card-title')[0]?.textContent).toBe('Home')
      expect(root.querySelector('.wiki-activity-title')?.textContent).toBe('Home')
      expect(root.textContent).toContain('3 views')
    })
    expect(Api.popularPages).toHaveBeenCalledWith(7, 1)
  })
})
