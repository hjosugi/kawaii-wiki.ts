import { describe, expect, test } from 'bun:test'
import type { Principal } from '@kawaii-wiki/core'
import { createDb } from '../db/client.ts'
import { createServices } from '../services/index.ts'
import { createEventBus, type WikiEvent } from '../realtime/bus.ts'
import { createGitSyncHandlers, startGitSyncScheduler } from './git-sync.ts'
import type { GitStorage } from './git.ts'

const admin: Principal = { id: 'admin', role: 'admin' }

describe('git sync runtime wiring', () => {
  test('upsert creates/updates pages and emits page-change events', () => {
    const db = createDb(':memory:')
    const services = createServices(db)
    const bus = createEventBus()
    const events: WikiEvent[] = []
    bus.subscribe((event) => events.push(event))
    const handlers = createGitSyncHandlers({ services, bus, systemPrincipal: admin })

    handlers.upsert('docs/git', { title: 'Git', description: 'from git', content: 'first' })
    handlers.upsert('docs/git', { title: 'Git v2', description: 'updated', content: 'second' })

    const page = services.pages.getByPath('docs/git')
    expect(page.ok).toBe(true)
    if (page.ok) {
      expect(page.value.title).toBe('Git v2')
      expect(page.value.content).toBe('second')
    }
    expect(events.map((event) => event.action)).toEqual(['created', 'updated'])
    db.$client.close()
  })

  test('remove deletes pages and emits a delete event', () => {
    const db = createDb(':memory:')
    const services = createServices(db)
    services.pages.create({ path: 'docs/remove', title: 'Remove', content: 'x' }, admin)
    const bus = createEventBus()
    const events: WikiEvent[] = []
    bus.subscribe((event) => events.push(event))
    const handlers = createGitSyncHandlers({ services, bus, systemPrincipal: admin })

    handlers.remove('docs/remove')

    expect(services.pages.getByPath('docs/remove').ok).toBe(false)
    expect(events).toEqual([{ type: 'page:changed', action: 'deleted', path: 'docs/remove' }])
    db.$client.close()
  })

  test('scheduler is inert unless git sync is enabled with a remote interval', () => {
    let syncCalls = 0
    const git = {
      enabled: true,
      sync: async () => {
        syncCalls += 1
        return { enabled: true, pulled: false, pushed: false, upserted: [], deleted: [] }
      },
    } as unknown as GitStorage

    const stop = startGitSyncScheduler(
      git,
      {
        enabled: true,
        dir: 'repo',
        branch: 'main',
        remote: null,
        remoteUrl: null,
        authorName: 'Test',
        authorEmail: 'test@example.com',
        syncIntervalMs: 1,
      },
      { upsert: () => {}, remove: () => {} },
    )
    stop()
    expect(syncCalls).toBe(0)
  })
})
