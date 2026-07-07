import { asc, eq } from 'drizzle-orm'
import { err, normalizeLabels, normalizePath, notFound, ok, type PageStatus, validationError } from '@ts-wiki/core'
import type { DB } from '../../db/client.ts'
import { automationRules, pages, type AutomationRule, type Page } from '../../db/schema.ts'
import type {
  AutomationEvent,
  AutomationRuleView,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
} from '../webhooks.ts'
import {
  cleanName,
  cleanRuleConfig,
  pageSnapshot,
  parseLabels,
  parseRuleConfig,
  requireManage,
} from './shared.ts'

const toRuleView = (row: AutomationRule): AutomationRuleView => ({
  id: row.id,
  name: row.name,
  type: row.type,
  enabled: Boolean(row.enabled),
  config: parseRuleConfig(row.config),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface AutomationRules {
  applyPageMetadataRules(event: AutomationEvent): Record<string, unknown>
  list: import('../webhooks.ts').WebhookService['listAutomationRules']
  create: import('../webhooks.ts').WebhookService['createAutomationRule']
  update: import('../webhooks.ts').WebhookService['updateAutomationRule']
  delete: import('../webhooks.ts').WebhookService['deleteAutomationRule']
}

export interface AutomationRuleOptions {
  readonly now: () => number
}

export const createAutomationRules = (db: DB, { now }: AutomationRuleOptions): AutomationRules => {
  const findPageForEvent = (event: AutomationEvent): Page | null => {
    const page = event.data.page && typeof event.data.page === 'object'
      ? event.data.page as Record<string, unknown>
      : null
    const id = page?.id
    if (typeof id === 'string') {
      const byId = db.select().from(pages).where(eq(pages.id, id)).get()
      if (byId) return byId
    }
    const path = page?.path
    return typeof path === 'string'
      ? db.select().from(pages).where(eq(pages.path, normalizePath(path))).get() ?? null
      : null
  }

  return {
    applyPageMetadataRules(event) {
      if (event.type !== 'page.updated') return event.data
      let current = findPageForEvent(event)
      if (!current || current.lifecycle !== 'active') return event.data

      for (const rule of db
        .select()
        .from(automationRules)
        .where(eq(automationRules.enabled, true))
        .orderBy(asc(automationRules.createdAt))
        .all()) {
        if (rule.type !== 'page-updated-metadata') continue
        const config = parseRuleConfig(rule.config)
        if (current.path !== config.pathPrefix && !current.path.startsWith(`${config.pathPrefix.replace(/\/+$/, '')}/`)) {
          continue
        }

        const labels = parseLabels(current.labels)
        const nextLabels = config.label ? normalizeLabels([...labels, config.label]) : labels
        const nextStatus: PageStatus = config.status ?? current.status
        if (JSON.stringify(labels) === JSON.stringify(nextLabels) && current.status === nextStatus) continue

        const updatedAt = now()
        db.update(pages)
          .set({
            labels: JSON.stringify(nextLabels),
            status: nextStatus,
            updatedAt,
          })
          .where(eq(pages.id, current.id))
          .run()
        current = { ...current, labels: JSON.stringify(nextLabels), status: nextStatus, updatedAt }
      }

      return { ...event.data, page: pageSnapshot(current) }
    },

    list(principal) {
      const allowed = requireManage(principal)
      if (!allowed.ok) return allowed
      return ok(db.select().from(automationRules).orderBy(asc(automationRules.createdAt)).all().map(toRuleView))
    },

    create(principal, input: CreateAutomationRuleInput) {
      const allowed = requireManage(principal)
      if (!allowed.ok) return allowed
      if (input.type !== 'page-updated-metadata') return err(validationError('Unknown automation rule type', 'type'))
      const config = cleanRuleConfig(input.config)
      if (!config.ok) return config

      const createdAt = now()
      const rule: AutomationRule = {
        id: crypto.randomUUID(),
        name: cleanName(input.name, 'Page metadata rule'),
        type: input.type,
        enabled: input.enabled ?? true,
        config: JSON.stringify(config.value),
        createdAt,
        updatedAt: createdAt,
      }
      db.insert(automationRules).values(rule).run()
      return ok(toRuleView(rule))
    },

    update(principal, id, input: UpdateAutomationRuleInput) {
      const allowed = requireManage(principal)
      if (!allowed.ok) return allowed
      const current = db.select().from(automationRules).where(eq(automationRules.id, id)).get()
      if (!current) return err(notFound('Automation rule not found'))

      const changes: {
        name?: string
        enabled?: boolean
        config?: string
        updatedAt: number
      } = { updatedAt: now() }

      if (input.name !== undefined) changes.name = cleanName(input.name, current.name)
      if (input.enabled !== undefined) changes.enabled = input.enabled
      if (input.config !== undefined) {
        const config = cleanRuleConfig(input.config)
        if (!config.ok) return config
        changes.config = JSON.stringify(config.value)
      }

      db.update(automationRules).set(changes).where(eq(automationRules.id, id)).run()
      return ok(toRuleView(db.select().from(automationRules).where(eq(automationRules.id, id)).get()!))
    },

    delete(principal, id) {
      const allowed = requireManage(principal)
      if (!allowed.ok) return allowed
      db.delete(automationRules).where(eq(automationRules.id, id)).run()
      return ok({ id })
    },
  }
}
