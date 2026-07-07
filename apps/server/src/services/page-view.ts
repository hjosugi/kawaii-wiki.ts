import { normalizeLabels, parseJsonStringArray } from '@ts-wiki/core'
import type { Page } from '../db/schema.ts'

export const parsePageLabels = (value: string): string[] => normalizeLabels(parseJsonStringArray(value))

export const pageSnapshot = (page: Page) => ({
  id: page.id,
  path: page.path,
  title: page.title,
  lifecycle: page.lifecycle,
  status: page.status,
  labels: parsePageLabels(page.labels),
  ownerId: page.ownerId,
  reviewAt: page.reviewAt,
  spaceKey: page.spaceKey,
  locale: page.locale,
  createdAt: page.createdAt,
  updatedAt: page.updatedAt,
})
