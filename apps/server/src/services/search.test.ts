import { describe, expect, test } from 'bun:test'
import { buildMatchQuery, containsCjk } from './search.ts'

describe('search service helpers', () => {
  test('buildMatchQuery handles phrases, exclusions, and title scope', () => {
    expect(buildMatchQuery('banana "error code" -draft -"old phrase"', 'title')).toBe(
      'title : ("banana"* "error code" NOT "draft"* NOT "old phrase")',
    )
  })

  test('buildMatchQuery sanitizes FTS syntax and ignores negative-only searches', () => {
    expect(buildMatchQuery('alpha(foo) title:^bar')).toBe('"alpha"* "foo"* "title"* "bar"*')
    expect(buildMatchQuery('-draft -"old phrase"')).toBeNull()
  })

  test('containsCjk detects Japanese, Chinese, and Korean search text', () => {
    expect(containsCjk('plain ascii')).toBe(false)
    expect(containsCjk('日本語')).toBe(true)
    expect(containsCjk('검색')).toBe(true)
  })
})
