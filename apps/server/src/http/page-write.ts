import type { AppError, Principal, Result } from '@ts-wiki/core'
import type { Page } from '../db/schema.ts'
import type { AutomationEvent } from '../services/webhooks.ts'
import { pageSnapshot } from './representations.ts'

export type PageChangedAction = 'created' | 'updated' | 'deleted' | 'moved'

export interface PageWriteEffectsInput {
  readonly action: PageChangedAction
  readonly page?: Page
  readonly path?: string
  readonly from?: string
  readonly principal: Principal | null
  readonly auditAction: string
  readonly auditData?: Record<string, unknown>
  readonly automation?: AutomationEvent
  readonly mirror?: 'save' | 'delete' | 'move' | 'none'
}

export type PageWriteEffects = (input: PageWriteEffectsInput) => Promise<void>

export const valueIfOk = <T>(result: Result<T, AppError>): T | null =>
  result.ok ? result.value : null

const previousPayload = (previous?: Page | null): Record<string, unknown> =>
  previous ? { previous: pageSnapshot(previous) } : {}

export const removedPagePayload = (previous?: Page | null): Record<string, unknown> =>
  previous ? { page: pageSnapshot(previous) } : {}

export const pageAutomation = (
  type: string,
  principal: Principal | null,
  page: Page,
  data: Record<string, unknown> = {},
  previous?: Page | null,
): AutomationEvent => ({
  type,
  actorId: principal?.id ?? null,
  data: {
    page: pageSnapshot(page),
    ...data,
    ...previousPayload(previous),
  },
})

export const runPageWrite = async (
  pageWriteEffects: PageWriteEffects,
  input: Omit<PageWriteEffectsInput, 'automation'> & {
    readonly page: Page
    readonly automationType: string
    readonly automationData?: Record<string, unknown>
    readonly previous?: Page | null
  },
): Promise<{ page: Page }> => {
  const { automationType, automationData = {}, previous, ...effect } = input
  await pageWriteEffects({
    ...effect,
    automation: pageAutomation(automationType, effect.principal, effect.page, automationData, previous),
  })
  return { page: effect.page }
}
