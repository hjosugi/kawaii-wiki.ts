import type { Principal } from '@kawaii-wiki/core'
import type { DB } from '../db/client.ts'
import type { RealtimeEnv } from '../env.ts'
import { createDbEventBus, createEventBus, type EventBus } from './bus.ts'
import { createPresence, dedupeViewers, type ViewerMode } from './presence.ts'
import { createCollabHub, type CollabConn, type CollabOptions, type CollabSeed } from './collab.ts'

export const createRealtimeBus = (db: DB, env: RealtimeEnv): EventBus =>
  env.eventBus === 'db'
    ? createDbEventBus(db, {
        sourceId: env.instanceId,
        pollIntervalMs: env.pollIntervalMs,
      })
    : createEventBus()

export interface PresenceSocket {
  send(data: string): unknown
}

export const createPresenceRuntime = () => {
  const presence = createPresence()
  const sockets = new Map<string, PresenceSocket>()

  const broadcast = (path: string): void => {
    const viewers = presence.list(path)
    const message = JSON.stringify({ type: 'presence', path, viewers: dedupeViewers(viewers) })
    for (const viewer of viewers) sockets.get(viewer.id)?.send(message)
  }

  return {
    open(
      id: string,
      socket: PresenceSocket,
      path: string,
      identity: { name?: string; userId?: string; mode?: ViewerMode },
    ): void {
      sockets.set(id, socket)
      presence.join(path, id, {
        userId: identity.userId ?? null,
        name: (identity.name ?? '').trim() || 'Anonymous',
        mode: identity.mode ?? 'viewing',
      })
      broadcast(path)
    },
    close(id: string): void {
      sockets.delete(id)
      const path = presence.leave(id)
      if (path) broadcast(path)
    },
  }
}

const toBytes = (message: unknown): Uint8Array | null => {
  if (message instanceof Uint8Array) return message
  if (message instanceof ArrayBuffer) return new Uint8Array(message)
  if (ArrayBuffer.isView(message)) {
    const view = message as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  return null
}

export const createCollabRuntime = (options: CollabOptions = {}) => {
  const hub = createCollabHub(options)
  const conns = new Map<string, { room: string; conn: CollabConn; principal: Principal }>()

  return {
    open(
      id: string,
      room: string,
      send: (data: Uint8Array) => unknown,
      seed: () => CollabSeed,
      principal: Principal,
    ): void {
      const conn: CollabConn = { send: (data) => void send(data) }
      conns.set(id, { room, conn, principal })
      hub.open(room, conn, seed, principal)
    },
    message(id: string, message: unknown): void {
      const entry = conns.get(id)
      if (!entry) return
      const bytes = toBytes(message)
      if (bytes) hub.message(entry.room, entry.conn, bytes)
    },
    close(id: string): void {
      const entry = conns.get(id)
      if (!entry) return
      hub.close(entry.room, entry.conn)
      conns.delete(id)
    },
  }
}
