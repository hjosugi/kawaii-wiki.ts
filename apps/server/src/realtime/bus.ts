/**
 * Event bus — the transport-agnostic core of realtime.
 *
 * Page mutations emit `WikiEvent`s here; transports just subscribe. Today that's
 * SSE (`GET /api/events`); a WebSocket endpoint can subscribe to the SAME bus
 * later with no other change.
 *
 * `createEventBus()` is the tiny in-memory implementation used by focused unit
 * tests. `createDbEventBus()` persists events into the SQLite-family shared log
 * (including remote libSQL replicas) and polls it, so multiple server processes
 * attached to the same database see each other's page-change notifications.
 */
import { asc, gt, lte, sql } from 'drizzle-orm'
import type { DB } from '../db/client.ts'
import { wikiEvents } from '../db/schema.ts'
import { unrefTimer } from '../utils/timers.ts'

export interface WikiEvent {
  readonly type: 'page:changed'
  readonly action: 'created' | 'updated' | 'moved' | 'deleted'
  readonly path: string
  /** Previous path, present on moves. */
  readonly from?: string
}

export type Listener = (event: WikiEvent) => void

export interface EventBus {
  emit(event: WikiEvent): void
  /** Subscribe; returns an unsubscribe function. */
  subscribe(listener: Listener): () => void
  /** Current subscriber count (diagnostics/tests). */
  size(): number
  /** Stop background work. Mostly used by tests. */
  close(): void
}

/** Deliver an event to every listener; a throwing listener never breaks the loop. */
export const deliver = (listeners: Set<Listener>, event: WikiEvent): void => {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      /* a broken subscriber must not break the emit loop */
    }
  }
}

export const createEventBus = (): EventBus => {
  const listeners = new Set<Listener>()
  return {
    emit(event) {
      deliver(listeners, event)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    size() {
      return listeners.size
    },
    close() {
      listeners.clear()
    },
  }
}

export interface DbEventBusOptions {
  /** Stable per-process id. Defaults to a random UUID on boot. */
  readonly sourceId?: string
  /** How quickly this process observes events emitted by peers. */
  readonly pollIntervalMs?: number
  /** How often retained DB events are pruned when there is no local traffic. */
  readonly pruneIntervalMs?: number
  /** Maximum number of recent DB events to retain for peer polling. */
  readonly maxStoredEvents?: number
}

const DEFAULT_MAX_STORED_EVENTS = 10_000
export const maxStoredEventsFrom = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : DEFAULT_MAX_STORED_EVENTS

export const createDbEventBus = (db: DB, options: DbEventBusOptions = {}): EventBus => {
  const listeners = new Set<Listener>()
  const sourceId = options.sourceId ?? crypto.randomUUID()
  const pollIntervalMs = Math.max(25, options.pollIntervalMs ?? 250)
  const pruneIntervalMs = Math.max(pollIntervalMs, options.pruneIntervalMs ?? Math.max(60_000, pollIntervalMs * 20))
  const maxStoredEvents = maxStoredEventsFrom(options.maxStoredEvents)
  const ownDelivered = new Set<number>()
  const insertEvent = db.$client.prepare(`
    INSERT INTO wiki_events (source_id, event_type, action, path, from_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const withReader = <T>(read: (reader: DB) => T): T => {
    const reader = db.$openReadReplica?.()
    if (!reader) return read(db)
    try {
      return read(reader)
    } finally {
      reader.$client.close()
    }
  }

  const getMaxEventId = (): number =>
    withReader((reader) =>
      reader.select({ id: sql<number>`coalesce(max(${wikiEvents.id}), 0)` }).from(wikiEvents).get()?.id ?? 0,
    )

  let lastSeenId = getMaxEventId()
  let polling = false

  const prune = (): void => {
    const pruneThroughId = getMaxEventId() - maxStoredEvents
    if (pruneThroughId <= 0) return

    db.delete(wikiEvents).where(lte(wikiEvents.id, pruneThroughId)).run()
    for (const id of ownDelivered) {
      if (id <= pruneThroughId) ownDelivered.delete(id)
    }
  }

  const pruneBestEffort = (): void => {
    try {
      prune()
    } catch {
      /* pruning is best-effort; event delivery should continue */
    }
  }

  const poll = (): void => {
    if (listeners.size === 0) return
    if (polling) return
    polling = true
    try {
      const rows = withReader((reader) =>
        reader
          .select()
          .from(wikiEvents)
          .where(gt(wikiEvents.id, lastSeenId))
          .orderBy(asc(wikiEvents.id))
          .limit(100)
          .all(),
      )
      for (const row of rows) {
        lastSeenId = row.id
        const alreadyDeliveredLocally = row.sourceId === sourceId && ownDelivered.delete(row.id)
        if (alreadyDeliveredLocally) continue
        deliver(listeners, {
          type: row.eventType,
          action: row.action,
          path: row.path,
          ...(row.fromPath ? { from: row.fromPath } : {}),
        })
      }
      pruneBestEffort()
    } catch {
      // A transient replica sync/read failure is retried on the next poll.
    } finally {
      polling = false
    }
  }

  pruneBestEffort()

  const timer = setInterval(poll, pollIntervalMs)
  unrefTimer(timer)
  const pruneTimer = setInterval(pruneBestEffort, pruneIntervalMs)
  unrefTimer(pruneTimer)

  return {
    emit(event) {
      // The raw run result exposes lastInsertRowid without issuing a RETURNING
      // read, which would pin a remote libSQL replica's writer snapshot.
      const inserted = insertEvent.run(
        sourceId,
        event.type,
        event.action,
        event.path,
        event.from ?? null,
        Date.now(),
      )
      const insertedId = Number(inserted.lastInsertRowid)
      if (!Number.isSafeInteger(insertedId) || insertedId <= 0) {
        throw new Error('wiki event insert did not return a valid row id')
      }
      ownDelivered.add(insertedId)
      deliver(listeners, event)
      pruneBestEffort()
    },
    subscribe(listener) {
      if (listeners.size === 0) lastSeenId = getMaxEventId()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    size() {
      return listeners.size
    },
    close() {
      clearInterval(timer)
      clearInterval(pruneTimer)
      listeners.clear()
      ownDelivered.clear()
    },
  }
}
