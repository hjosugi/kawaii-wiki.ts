import { describe, expect, test } from 'vitest'
import { editableDomToMarkdown, markdownToEditableHtml } from './visualMarkdown'

const roundTrip = (markdown: string): string => {
  const root = document.createElement('div')
  root.innerHTML = markdownToEditableHtml(markdown)
  return editableDomToMarkdown(root)
}

describe('visual Markdown conversion', () => {
  test('round-trips supported headings, inline formatting, lists, tables, and callouts', () => {
    const markdown = [
      '# Title',
      '',
      'Hello **bold** and *italic* with [a link](https://example.com).',
      '',
      '- one',
      '- two',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| A | B |',
      '',
      '```callout',
      'type: warning',
      'title: Check this',
      '',
      'Callout body',
      '```',
      '',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(markdown)
  })

  test('preserves unsupported fenced blocks as raw Markdown', () => {
    const markdown = '```event\ntitle: Release\nstart: 2026-07-10 12:00\n```\n'
    expect(roundTrip(markdown)).toBe(markdown)
  })
})
