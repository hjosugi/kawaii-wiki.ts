/**
 * Realtime client — subscribes to the server's SSE stream (`/api/events`) and
 * fans `page:changed` events out to in-app listeners. Reconnects mint fresh
 * realtime tickets, so consumed one-time ticket URLs are never retried.
 */
import { Api, getToken } from './api'
import { API_BASE_URL } from './url'

export interface WikiEvent {
  type: 'page:changed'
  action: 'created' | 'updated' | 'moved' | 'deleted'
  path: string
  from?: string
}

type Listener = (event: WikiEvent) => void

const listeners = new Set<Listener>()
let source: EventSource | null = null
let opening = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const clearReconnect = (): void => {
  if (!reconnectTimer) return
  clearTimeout(reconnectTimer)
  reconnectTimer = null
}

const scheduleReconnect = (): void => {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void openRealtime()
  }, 2000)
}

export function connectRealtime(): void {
  if (source || opening) return
  clearReconnect()
  void openRealtime()
}

const realtimeUrl = async (): Promise<string | null> => {
  const token = getToken()
  const url = new URL('/api/events', API_BASE_URL)
  if (!token) return url.toString()
  try {
    const ticket = await Api.realtimeTicket()
    url.searchParams.set('ticket', ticket.ticket)
    return url.toString()
  } catch {
    return null
  }
}

const openRealtime = async (): Promise<void> => {
  if (source || opening) return
  opening = true
  const url = await realtimeUrl()
  opening = false
  if (!url) {
    scheduleReconnect()
    return
  }
  if (source) return
  const next = new EventSource(url)
  source = next
  next.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as WikiEvent
      if (event?.type === 'page:changed') {
        for (const listener of listeners) listener(event)
      }
    } catch {
      /* ignore malformed frames */
    }
  }
  next.onerror = () => {
    if (source !== next) return
    next.close()
    source = null
    scheduleReconnect()
  }
}

export function onWikiEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
