/**
 * Path & heading slugification — pure, dependency-free, and Unicode-friendly.
 *
 * We use an allow-list (keep letters & numbers, turn everything else into a
 * hyphen) rather than a block-list, so it's robust to arbitrary punctuation.
 * Crucially it keeps non-ASCII letters, so Japanese, Cyrillic, etc. survive in
 * paths and anchors (e.g. `/ガイド/はじめに`).
 */

const NON_WORD = /[^\p{L}\p{N}]+/gu
const MULTI_DASH = /-{2,}/g
const EDGE_DASH = /^-+|-+$/g

/** Slugify a single segment (no slashes): lowercase, non-word runs → `-`. */
export const slugifySegment = (input: string): string =>
  input
    .normalize('NFKC')
    .toLowerCase()
    .replace(NON_WORD, '-')
    .replace(MULTI_DASH, '-')
    .replace(EDGE_DASH, '')

/**
 * Normalise a full wiki path: split on `/`, slugify each segment, drop empties.
 * `"  Docs / Getting Started "` → `"docs/getting-started"`.
 */
export const normalizePath = (input: string): string =>
  input
    .split('/')
    .map((seg) => slugifySegment(seg))
    .filter((seg) => seg.length > 0)
    .join('/')

/** Slugify heading text into an anchor id. Shared by the renderer and the TOC. */
export const slugifyHeading = (input: string): string => slugifySegment(input) || 'section'
