import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { asc, desc, eq, lte } from 'drizzle-orm'
import { err, notFound, ok, validationError } from '@ts-wiki/core'
import type { DB } from '../../db/client.ts'
import { webhookDeliveries, type WebhookDelivery, type WebhookSubscription } from '../../db/schema.ts'
import type {
  WebhookDeliveryView,
  WebhookFetcher,
  WebhookHostnameResolver,
  WebhookPayload,
} from '../webhooks.ts'
import {
  ensurePublicLiteralTarget,
  hostnameForValidation,
  isPrivateOrReservedAddress,
  requireManage,
  truncate,
} from './shared.ts'

const MAX_RESPONSE_BODY = 2000
const MAX_ERROR = 1000
const MAX_ATTEMPTS = 3
const MAX_REDIRECTS = 5

const errorMessage = (error: unknown): string =>
  truncate(error instanceof Error ? error.message : String(error), MAX_ERROR)

const signPayload = (secret: string, timestamp: string, payload: string): string =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`

const retryAt = (now: number, attempts: number): number | null =>
  attempts < MAX_ATTEMPTS ? now + Math.min(60_000 * 2 ** (attempts - 1), 15 * 60_000) : null

const cloneRequestInit = (init: RequestInit): RequestInit => ({
  ...init,
  headers: new Headers(init.headers),
})

const assertPublicDeliveryTarget = async (
  url: URL,
  resolver: WebhookHostnameResolver,
  allowPrivateTargets: boolean,
): Promise<void> => {
  if (allowPrivateTargets) return
  const publicLiteral = ensurePublicLiteralTarget(url)
  if (!publicLiteral.ok) throw new Error(publicLiteral.error.message)

  const hostname = hostnameForValidation(url)
  if (isIP(hostname)) return

  const addresses = await resolver(hostname)
  if (addresses.length === 0) {
    throw new Error(`Webhook target hostname ${hostname} did not resolve`)
  }
  const blockedAddress = addresses.find((address) => isPrivateOrReservedAddress(address))
  if (blockedAddress) {
    throw new Error(`Webhook target hostname ${hostname} resolved to blocked address ${blockedAddress}`)
  }
}

const redirectUrl = (url: URL, response: Response): URL | null => {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null
  const location = response.headers.get('location')
  return location ? new URL(location, url) : null
}

const fetchWebhook = async (
  targetUrl: string,
  init: RequestInit,
  fetcher: WebhookFetcher,
  resolver: WebhookHostnameResolver,
  allowPrivateTargets: boolean,
): Promise<Response> => {
  let url = new URL(targetUrl)
  let currentInit = cloneRequestInit(init)

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDeliveryTarget(url, resolver, allowPrivateTargets)
    const response = await fetcher(url.toString(), { ...currentInit, redirect: 'manual' })
    const next = redirectUrl(url, response)
    if (!next) return response

    if (redirects === MAX_REDIRECTS) {
      throw new Error(`Webhook target exceeded ${MAX_REDIRECTS} redirects`)
    }
    if (next.protocol !== 'https:' && next.protocol !== 'http:') {
      throw new Error('Webhook redirect URL must use http or https')
    }
    if (response.status === 303) {
      currentInit = { ...currentInit, method: 'GET', body: undefined }
    }
    url = next
  }

  throw new Error(`Webhook target exceeded ${MAX_REDIRECTS} redirects`)
}

export interface WebhookDeliveryOptions {
  readonly fetcher: WebhookFetcher
  readonly resolver: WebhookHostnameResolver
  readonly allowPrivateTargets: boolean
  readonly now: () => number
  readonly findSubscription: (id: string) => WebhookSubscription | null
}

export interface WebhookDeliveryService {
  publish(payload: WebhookPayload, subscriptions: WebhookSubscription[]): Promise<WebhookDeliveryView[]>
  listDeliveries: import('../webhooks.ts').WebhookService['listDeliveries']
  retryDelivery: import('../webhooks.ts').WebhookService['retryDelivery']
  processDueDeliveries: import('../webhooks.ts').WebhookService['processDueDeliveries']
}

export const createWebhookDelivery = (
  db: DB,
  {
    fetcher,
    resolver,
    allowPrivateTargets,
    now,
    findSubscription,
  }: WebhookDeliveryOptions,
): WebhookDeliveryService => {
  const findDelivery = (id: string): WebhookDelivery | null =>
    db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).get() ?? null

  const toDeliveryView = (row: WebhookDelivery): WebhookDeliveryView => ({
    id: row.id,
    subscriptionId: row.subscriptionId,
    subscriptionName: findSubscription(row.subscriptionId)?.name ?? null,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deliveredAt: row.deliveredAt,
  })

  const deliver = async (delivery: WebhookDelivery, subscription: WebhookSubscription): Promise<WebhookDeliveryView> => {
    const startedAt = now()
    const attempts = delivery.attempts + 1
    const timestamp = String(startedAt)
    const signature = signPayload(subscription.secret, timestamp, delivery.payload)

    try {
      const response = await fetchWebhook(subscription.targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'ts-wiki-webhooks/1',
          'x-ts-wiki-delivery': delivery.id,
          'x-ts-wiki-event': delivery.eventType,
          'x-ts-wiki-signature': signature,
          'x-ts-wiki-timestamp': timestamp,
        },
        body: delivery.payload,
      }, fetcher, resolver, allowPrivateTargets)
      const responseBody = truncate(await response.text().catch(() => ''), MAX_RESPONSE_BODY)
      const updatedAt = now()
      db.update(webhookDeliveries)
        .set({
          status: response.ok ? 'succeeded' : 'failed',
          attempts,
          nextAttemptAt: response.ok ? null : retryAt(updatedAt, attempts),
          responseStatus: response.status,
          responseBody,
          error: response.ok ? null : truncate(response.statusText || `HTTP ${response.status}`, MAX_ERROR),
          updatedAt,
          deliveredAt: response.ok ? updatedAt : null,
        })
        .where(eq(webhookDeliveries.id, delivery.id))
        .run()
    } catch (error) {
      const updatedAt = now()
      db.update(webhookDeliveries)
        .set({
          status: 'failed',
          attempts,
          nextAttemptAt: retryAt(updatedAt, attempts),
          responseStatus: null,
          responseBody: null,
          error: errorMessage(error),
          updatedAt,
          deliveredAt: null,
        })
        .where(eq(webhookDeliveries.id, delivery.id))
        .run()
    }

    return toDeliveryView(findDelivery(delivery.id)!)
  }

  const enqueue = (subscription: WebhookSubscription, payload: WebhookPayload): WebhookDelivery => {
    const createdAt = now()
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      subscriptionId: subscription.id,
      eventId: payload.id,
      eventType: payload.type,
      payload: JSON.stringify(payload),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: createdAt,
      responseStatus: null,
      responseBody: null,
      error: null,
      createdAt,
      updatedAt: createdAt,
      deliveredAt: null,
    }
    db.insert(webhookDeliveries).values(delivery).run()
    return delivery
  }

  return {
    async publish(payload, subscriptions) {
      const deliveries: WebhookDeliveryView[] = []
      for (const subscription of subscriptions) {
        const delivery = enqueue(subscription, payload)
        deliveries.push(await deliver(delivery, subscription))
      }
      return deliveries
    },

    listDeliveries(principal, filters = {}) {
      const allowed = requireManage(principal)
      if (!allowed.ok) return allowed
      const limit = Math.max(1, Math.min(filters.limit ?? 100, 500))
      const rows = filters.status
        ? db
            .select()
            .from(webhookDeliveries)
            .where(eq(webhookDeliveries.status, filters.status))
            .orderBy(desc(webhookDeliveries.createdAt))
            .limit(limit)
            .all()
        : db
            .select()
            .from(webhookDeliveries)
            .orderBy(desc(webhookDeliveries.createdAt))
            .limit(limit)
            .all()
      return ok(rows.map(toDeliveryView))
    },

    async retryDelivery(principal, id) {
      const allowed = requireManage(principal)
      if (!allowed.ok) return allowed
      const delivery = findDelivery(id)
      if (!delivery) return err(notFound('Webhook delivery not found'))
      const subscription = findSubscription(delivery.subscriptionId)
      if (!subscription) return err(notFound('Webhook subscription not found'))
      if (!subscription.enabled) return err(validationError('Webhook subscription is disabled', 'subscriptionId'))

      const updatedAt = now()
      db.update(webhookDeliveries)
        .set({ status: 'pending', nextAttemptAt: updatedAt, error: null, updatedAt })
        .where(eq(webhookDeliveries.id, id))
        .run()
      return ok(await deliver(findDelivery(id)!, subscription))
    },

    async processDueDeliveries(limit = 25) {
      const dueAt = now()
      const rows = db
        .select()
        .from(webhookDeliveries)
        .where(lte(webhookDeliveries.nextAttemptAt, dueAt))
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(Math.max(1, Math.min(limit, 100)))
        .all()
        .filter((delivery) => delivery.status !== 'succeeded' && delivery.attempts < MAX_ATTEMPTS)

      const delivered: WebhookDeliveryView[] = []
      for (const delivery of rows) {
        const subscription = findSubscription(delivery.subscriptionId)
        if (!subscription?.enabled) continue
        delivered.push(await deliver(delivery, subscription))
      }
      return delivered
    },
  }
}
