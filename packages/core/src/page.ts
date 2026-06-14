/**
 * Page domain — types and pure validators. No DB, no I/O.
 *
 * The server's `PageService` calls these before touching the database, so all
 * the "is this input sane?" logic is unit-testable in isolation.
 */
import { type Result, ok, err } from './result.ts'
import { type AppError, validationError } from './errors.ts'
import { normalizePath } from './slug.ts'
import { summarize } from './markdown.ts'

export type ContentType = 'markdown'

export interface PageInput {
  readonly path: string
  readonly title: string
  readonly content: string
  readonly description?: string
}

/** A validated, normalised page input ready to persist. */
export interface ValidPageInput {
  readonly path: string
  readonly title: string
  readonly content: string
  readonly description: string
  readonly contentType: ContentType
}

const MAX_PATH = 512
const MAX_TITLE = 255

export const validatePageInput = (input: PageInput): Result<ValidPageInput, AppError> => {
  const path = normalizePath(input.path ?? '')
  if (path.length === 0) return err(validationError('Path is required', 'path'))
  if (path.length > MAX_PATH) return err(validationError(`Path must be ≤ ${MAX_PATH} characters`, 'path'))

  const title = (input.title ?? '').trim()
  if (title.length === 0) return err(validationError('Title is required', 'title'))
  if (title.length > MAX_TITLE) return err(validationError(`Title must be ≤ ${MAX_TITLE} characters`, 'title'))

  const content = input.content ?? ''
  const description = (input.description ?? '').trim() || summarize(content)

  return ok({ path, title, content, description, contentType: 'markdown' })
}
