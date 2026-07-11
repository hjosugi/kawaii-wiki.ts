import { describe, expect, test } from 'bun:test'
import type { Principal } from '@kawaii-wiki/core'
import { createDb } from '../db/client.ts'
import { createSqliteLinkPreviewRepository } from '../db/repositories/link-previews.ts'
import { createLinkPreviewService } from './link-previews.ts'
import type { WebhookFetcher } from './webhooks.ts'

const editor: Principal = { id: 'editor-1', role: 'editor' }

describe('link preview service', () => {
  test('unfurls OG metadata, normalizes tracking params, and caches responses', async () => {
    let calls = 0
    const fetcher: WebhookFetcher = async () => {
      calls += 1
      return new Response(`<!doctype html>
        <html>
          <head>
            <title>Fallback title</title>
            <meta property="og:title" content="Preview title">
            <meta property="og:description" content="Preview description">
            <meta property="og:image" content="/cover.jpg">
            <meta property="og:site_name" content="Example Site">
          </head>
        </html>`, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    const previews = createLinkPreviewService(createSqliteLinkPreviewRepository(createDb(':memory:')), {
      fetcher,
      resolver: async () => ['93.184.216.34'],
      now: () => 1_000,
    })

    const first = await previews.unfurl(editor, 'https://example.com/page?utm_source=x&keep=1#section')
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('unfurl failed')
    expect(first.value).toMatchObject({
      url: 'https://example.com/page?keep=1',
      provider: 'example.com',
      title: 'Preview title',
      description: 'Preview description',
      image: 'https://example.com/cover.jpg',
      siteName: 'Example Site',
    })

    const second = await previews.unfurl(editor, 'https://example.com/page?keep=1')
    expect(second.ok).toBe(true)
    expect(calls).toBe(1)
  })

  test('blocks private or reserved resolved hosts', async () => {
    const previews = createLinkPreviewService(createSqliteLinkPreviewRepository(createDb(':memory:')), {
      fetcher: async () => new Response('<title>nope</title>'),
      resolver: async () => ['127.0.0.1'],
    })
    const result = await previews.unfurl(editor, 'https://example.test/')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('validation')
  })

  test('drops thumbnails when OG rating metadata marks a preview restricted', async () => {
    const previews = createLinkPreviewService(createSqliteLinkPreviewRepository(createDb(':memory:')), {
      fetcher: async () => new Response(`<!doctype html>
        <html><head>
          <meta property="og:title" content="Illustration">
          <meta property="og:image" content="https://i.pximg.net/img-original/restricted.jpg">
          <meta property="og:rating" content="R-18">
        </head></html>`),
      resolver: async () => ['210.140.131.219'],
    })
    const result = await previews.unfurl(editor, 'https://www.pixiv.net/artworks/123')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unfurl failed')
    expect(result.value.provider).toBe('pixiv')
    expect(result.value.image).toBeNull()
  })

  test('parses and caches YouTube channel RSS without an API key', async () => {
    let calls = 0
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
        <entry>
          <yt:videoId>abc123</yt:videoId>
          <title>Launch stream</title>
          <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
          <author><name>Channel Name</name></author>
          <published>2026-07-09T12:00:00+00:00</published>
          <media:group><media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg"/></media:group>
        </entry>
      </feed>`
    const previews = createLinkPreviewService(createSqliteLinkPreviewRepository(createDb(':memory:')), {
      fetcher: async () => {
        calls += 1
        return new Response(feed, { headers: { 'content-type': 'application/atom+xml' } })
      },
      resolver: async () => ['142.250.191.238'],
      now: () => 2_000,
    })

    const first = await previews.youtubeLatest(null, 'UCaaaaaaaaaaaaaaaaaaaaaa', 1)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('rss failed')
    expect(first.value.videos).toEqual([
      {
        id: 'abc123',
        title: 'Launch stream',
        url: 'https://www.youtube.com/watch?v=abc123',
        author: 'Channel Name',
        publishedAt: '2026-07-09T12:00:00+00:00',
        thumbnail: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      },
    ])

    const second = await previews.youtubeLatest(editor, 'UCaaaaaaaaaaaaaaaaaaaaaa', 1)
    expect(second.ok).toBe(true)
    expect(calls).toBe(1)
  })
})
