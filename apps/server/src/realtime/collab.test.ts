import { describe, test, expect } from 'bun:test'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import type { Principal } from '@ts-wiki/core'
import { createCollabHub, type CollabConn } from './collab.ts'

const noopConn = (): CollabConn => ({ send: () => {} })
const editor: Principal = { id: 'editor', role: 'editor' }

const syncUpdate = (text: string): Uint8Array => {
  const doc = new Y.Doc()
  doc.getText('content').insert(0, text)
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 0)
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc))
  doc.destroy()
  return encoding.toUint8Array(encoder)
}

describe('collab hub', () => {
  test('seeds a room from the DB content on first open', () => {
    const hub = createCollabHub()
    hub.open('docs/intro', noopConn(), () => '# Seeded\n\nbody')
    expect(hub.text('docs/intro')).toBe('# Seeded\n\nbody')
    expect(hub.roomCount()).toBe(1)
  })

  test('a room is shared across connections and discarded when empty', () => {
    const hub = createCollabHub()
    const a = noopConn()
    const b = noopConn()
    hub.open('r', a, () => 'x')
    hub.open('r', b, () => 'ignored — room already exists')
    expect(hub.roomCount()).toBe(1)
    expect(hub.text('r')).toBe('x') // not re-seeded by the 2nd open

    hub.close('r', a)
    expect(hub.roomCount()).toBe(1) // b is still connected
    hub.close('r', b)
    expect(hub.roomCount()).toBe(0)
    expect(hub.text('r')).toBeNull()
  })

  test('stale-room autosave keeps using the original seed version after a rejected persist', async () => {
    const calls: Array<{ text: string; expectedUpdatedAt: number | null; principal: Principal | null }> = []
    const hub = createCollabHub({
      debounceMs: 1,
      maxWaitMs: 1,
      persist: (_room, text, expectedUpdatedAt, principal) => {
        calls.push({ text, expectedUpdatedAt, principal })
        return null
      },
    })
    const conn = noopConn()

    hub.open('docs/stale', conn, () => ({ text: '', updatedAt: 42 }), editor)
    hub.message('docs/stale', conn, syncUpdate('first'))
    await Bun.sleep(5)
    hub.message('docs/stale', conn, syncUpdate('second'))
    await Bun.sleep(5)
    hub.close('docs/stale', conn)

    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[0]?.text).toContain('first')
    expect(calls[0]?.expectedUpdatedAt).toBe(42)
    expect(calls[0]?.principal).toEqual(editor)
    expect(calls[1]?.expectedUpdatedAt).toBe(42)
  })
})
