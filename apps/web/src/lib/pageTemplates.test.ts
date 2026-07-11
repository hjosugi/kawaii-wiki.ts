import { describe, expect, test } from 'vitest'
import { builtInPageTemplates } from './pageTemplates'

describe('built-in page templates', () => {
  test('meeting template uses the supplied timezone instead of a hardcoded default', () => {
    const meeting = builtInPageTemplates('Europe/Paris').find((template) => template.key === 'builtin:meeting')
    expect(meeting?.content).toContain('timezone: Europe/Paris')
    expect(meeting?.content).not.toContain('timezone: Asia/Tokyo')
  })

  test('built-in template keys are unique', () => {
    const keys = builtInPageTemplates('Asia/Tokyo').map((template) => template.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('includes a daily note template for journal shortcuts', () => {
    const journal = builtInPageTemplates('Asia/Tokyo').find((template) => template.key === 'builtin:journal')
    expect(journal).toMatchObject({
      label: 'Daily note',
      builtIn: true,
      metadata: {
        title: 'Daily note',
        labels: ['journal'],
      },
    })
    expect(journal?.content).toContain('## Follow-ups')
  })

  test('includes the VTuber wiki starter templates with useful metadata', () => {
    const templates = builtInPageTemplates('Asia/Tokyo')
    const expected = [
      ['builtin:talent-profile', 'talents/new-talent', 'Talent profile'],
      ['builtin:stream-log', 'streams/YYYY-MM-DD-stream-title', 'Stream log'],
      ['builtin:song-list', 'songs/new-song-list', 'Song list'],
      ['builtin:glossary', 'glossary/new-term', 'Glossary'],
      ['builtin:event-announcement', 'events/new-event', 'Event announcement'],
    ] as const

    for (const [key, path, label] of expected) {
      const template = templates.find((item) => item.key === key)
      expect(template).toMatchObject({
        key,
        label,
        builtIn: true,
        metadata: expect.objectContaining({
          path,
          locale: 'ja',
          labels: expect.arrayContaining(['vtuber']),
        }),
      })
      expect(template?.description.length).toBeGreaterThan(10)
      expect(template?.metadata.title).toBeTruthy()
    }
  })

  test('VTuber templates include the expected safe content blocks', () => {
    const templates = Object.fromEntries(builtInPageTemplates('Asia/Tokyo').map((template) => [template.key, template]))

    expect(templates['builtin:talent-profile']?.content).toContain('```infobox')
    expect(templates['builtin:talent-profile']?.content).toContain('```links')
    expect(templates['builtin:talent-profile']?.content).toContain('```youtube-latest')

    expect(templates['builtin:stream-log']?.content).toContain('```event')
    expect(templates['builtin:stream-log']?.content).toContain('timezone: Asia/Tokyo')
    expect(templates['builtin:stream-log']?.content).toContain('```youtube')
    expect(templates['builtin:stream-log']?.content).toContain('```embed')

    expect(templates['builtin:song-list']?.content).toContain('```youtube')
    expect(templates['builtin:song-list']?.content).toContain('```links')

    expect(templates['builtin:glossary']?.content).toContain('```infobox')
    expect(templates['builtin:glossary']?.content).toContain('```embed')

    expect(templates['builtin:event-announcement']?.content).toContain('```event')
    expect(templates['builtin:event-announcement']?.content).toContain('timezone: Asia/Tokyo')
    expect(templates['builtin:event-announcement']?.content).toContain('```links')
    expect(templates['builtin:event-announcement']?.content).toContain('```embed')
  })

  test('localizes built-in template content for the Japanese interface', () => {
    const templates = Object.fromEntries(
      builtInPageTemplates('Asia/Tokyo', 'ja').map((template) => [template.key, template]),
    )

    expect(templates['builtin:blank']?.content).toContain('ここから本文を書き始めます')
    expect(templates['builtin:decision']?.content).toContain('## 背景')
    expect(templates['builtin:meeting']?.content).toContain('## 参加者')
    expect(templates['builtin:journal']?.content).toContain('## フォローアップ')
    expect(templates['builtin:spec']?.content).toContain('## 対象外')
    expect(templates['builtin:talent-profile']?.description).toContain('VTuber')
  })
})
