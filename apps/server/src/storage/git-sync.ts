import type { Principal } from '@ts-wiki/core'
import type { Services } from '../services/index.ts'
import type { EventBus } from '../realtime/bus.ts'
import type { GitEnv } from '../env.ts'
import type { GitStorage, GitSyncHandlers } from './git.ts'

export interface GitSyncRuntimeDeps {
  readonly services: Services
  readonly bus: EventBus
  readonly systemPrincipal?: Principal
}

const DEFAULT_SYSTEM: Principal = { id: 'git-sync', role: 'admin' }

export const createGitSyncHandlers = ({
  services,
  bus,
  systemPrincipal = DEFAULT_SYSTEM,
}: GitSyncRuntimeDeps): GitSyncHandlers => ({
  upsert: (path, file) => {
    const title = file.title || path.split('/').pop() || path
    const existing = services.pages.getByPath(path)
    const result = existing.ok
      ? services.pages.update(path, { title, description: file.description, content: file.content }, systemPrincipal)
      : services.pages.create({ path, title, content: file.content, description: file.description }, systemPrincipal)

    if (result.ok) {
      bus.emit({ type: 'page:changed', action: existing.ok ? 'updated' : 'created', path: result.value.path })
    }
  },
  remove: (path) => {
    if (services.pages.remove(path, systemPrincipal).ok) {
      bus.emit({ type: 'page:changed', action: 'deleted', path })
    }
  },
})

export const startGitSyncScheduler = (
  git: GitStorage,
  gitEnv: GitEnv,
  handlers: GitSyncHandlers,
  onError: (error: unknown) => void = (error) => console.warn('[git] auto-sync failed', error),
): (() => void) => {
  if (!git.enabled || !gitEnv.remote || gitEnv.syncIntervalMs <= 0) return () => {}

  const timer = setInterval(() => {
    void git.sync(handlers).catch(onError)
  }, gitEnv.syncIntervalMs)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  console.log(`[git] auto-sync every ${gitEnv.syncIntervalMs}ms -> ${gitEnv.remote}`)

  return () => clearInterval(timer)
}
