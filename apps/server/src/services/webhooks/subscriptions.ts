import { asc, eq } from 'drizzle-orm'
import { err, notFound, ok, requirePermission } from '@kawaii-wiki/core'
import type { DB } from '../../db/client.ts'
import { webhookSubscriptions, type WebhookSubscription } from '../../db/schema.ts'
import type {
  CreateWebhookSubscriptionInput,
  UpdateWebhookSubscriptionInput,
  WebhookSubscriptionView,
} from '../webhooks.ts'
import {
  cleanEventTypes,
  cleanName,
  cleanSecret,
  cleanTargetUrl,
  eventMatches,
  parseEventTypes,
} from './shared.ts'

const toSubscriptionView = (row: WebhookSubscription): WebhookSubscriptionView => ({
  id: row.id,
  name: row.name,
  targetUrl: row.targetUrl,
  eventTypes: parseEventTypes(row.eventTypes),
  enabled: Boolean(row.enabled),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface WebhookSubscriptions {
  findById(id: string): WebhookSubscription | null
  enabledForEvent(eventType: string): WebhookSubscription[]
  list: import('../webhooks.ts').WebhookService['listSubscriptions']
  create: import('../webhooks.ts').WebhookService['createSubscription']
  update: import('../webhooks.ts').WebhookService['updateSubscription']
  delete: import('../webhooks.ts').WebhookService['deleteSubscription']
}

export interface WebhookSubscriptionOptions {
  readonly allowPrivateTargets: boolean
  readonly now: () => number
}

export const createWebhookSubscriptions = (
  db: DB,
  { allowPrivateTargets, now }: WebhookSubscriptionOptions,
): WebhookSubscriptions => {
  const findById = (id: string): WebhookSubscription | null =>
    db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).get() ?? null

  return {
    findById,

    enabledForEvent(eventType) {
      return db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.enabled, true))
        .orderBy(asc(webhookSubscriptions.createdAt))
        .all()
        .filter((subscription) => eventMatches(subscription, eventType))
    },

    list(principal) {
      const allowed = requirePermission(principal, 'automation:manage')
      if (!allowed.ok) return allowed
      return ok(db.select().from(webhookSubscriptions).orderBy(asc(webhookSubscriptions.createdAt)).all().map(toSubscriptionView))
    },

    create(principal, input: CreateWebhookSubscriptionInput) {
      const allowed = requirePermission(principal, 'automation:manage')
      if (!allowed.ok) return allowed
      const targetUrl = cleanTargetUrl(input.targetUrl, allowPrivateTargets)
      if (!targetUrl.ok) return targetUrl
      const secret = cleanSecret(input.secret)
      if (!secret.ok) return secret
      const eventTypes = cleanEventTypes(input.eventTypes)
      if (!eventTypes.ok) return eventTypes

      const createdAt = now()
      const row: WebhookSubscription = {
        id: crypto.randomUUID(),
        name: cleanName(input.name, new URL(targetUrl.value).hostname),
        targetUrl: targetUrl.value,
        secret: secret.value,
        eventTypes: JSON.stringify(eventTypes.value),
        enabled: input.enabled ?? true,
        createdAt,
        updatedAt: createdAt,
      }
      db.insert(webhookSubscriptions).values(row).run()
      return ok(toSubscriptionView(row))
    },

    update(principal, id, input: UpdateWebhookSubscriptionInput) {
      const allowed = requirePermission(principal, 'automation:manage')
      if (!allowed.ok) return allowed
      const current = findById(id)
      if (!current) return err(notFound('Webhook subscription not found'))

      const changes: {
        name?: string
        targetUrl?: string
        secret?: string
        eventTypes?: string
        enabled?: boolean
        updatedAt: number
      } = { updatedAt: now() }

      if (input.name !== undefined) changes.name = cleanName(input.name, current.name)
      if (input.targetUrl !== undefined) {
        const targetUrl = cleanTargetUrl(input.targetUrl, allowPrivateTargets)
        if (!targetUrl.ok) return targetUrl
        changes.targetUrl = targetUrl.value
      }
      if (input.secret !== undefined) {
        const secret = cleanSecret(input.secret)
        if (!secret.ok) return secret
        changes.secret = secret.value
      }
      if (input.eventTypes !== undefined) {
        const eventTypes = cleanEventTypes(input.eventTypes)
        if (!eventTypes.ok) return eventTypes
        changes.eventTypes = JSON.stringify(eventTypes.value)
      }
      if (input.enabled !== undefined) changes.enabled = input.enabled

      db.update(webhookSubscriptions).set(changes).where(eq(webhookSubscriptions.id, id)).run()
      const updated = findById(id)
      return updated ? ok(toSubscriptionView(updated)) : err(notFound('Webhook subscription not found after update'))
    },

    delete(principal, id) {
      const allowed = requirePermission(principal, 'automation:manage')
      if (!allowed.ok) return allowed
      db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).run()
      return ok({ id })
    },
  }
}
