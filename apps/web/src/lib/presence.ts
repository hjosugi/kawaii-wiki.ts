/**
 * Presence client — one WebSocket per open page. The server broadcasts the
 * current viewer list for that page whenever someone joins or leaves.
 *
 * Identity (name/userId) is sent in the query for display; authenticated
 * sockets use a short-lived realtime ticket.
 */
import { Api, getToken } from './api'
import { WS_BASE_URL } from './url'

export type ViewerMode = 'viewing' | 'editing'

export interface PresenceViewer {
  userId: string | null
  name: string
  mode: ViewerMode
}

export function connectPresence(
  path: string,
  identity: { name: string; userId: string | null; mode: ViewerMode },
  onViewers: (viewers: PresenceViewer[]) => void,
): () => void {
  const params = new URLSearchParams({ path, name: identity.name, mode: identity.mode })
  if (identity.userId) params.set('userId', identity.userId)

  let closed = false
  let ws: WebSocket | null = null

  const open = async (): Promise<void> => {
    const token = getToken()
    if (token) {
      try {
        const ticket = await Api.realtimeTicket()
        params.set('ticket', ticket.ticket)
      } catch {
        return
      }
    }
    if (closed) return
    ws = new WebSocket(`${WS_BASE_URL}/api/presence?${params.toString()}`)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg?.type === 'presence' && msg.path === path) {
          onViewers(Array.isArray(msg.viewers) ? msg.viewers : [])
        }
      } catch {
        /* ignore malformed frames */
      }
    }
  }

  void open()

  return () => {
    closed = true
    const socket = ws
    ws = null
    socket?.close()
  }
}
