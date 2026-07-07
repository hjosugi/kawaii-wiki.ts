import type { GitStorage, GitSyncHandlers } from '../../storage/git.ts'
import { audit, type StructuredLogger } from '../../observability/logging.ts'
import { requireHttpPermission } from '../permissions.ts'
import type { BaseApp } from '../base.ts'

export interface GitRoutesContext {
  readonly git: GitStorage
  readonly gitSyncHandlers: GitSyncHandlers
  readonly logger: StructuredLogger
}

export const createGitRoutes = ({ git, gitSyncHandlers, logger }: GitRoutesContext) => (app: BaseApp) =>
  app
    .get('/api/git/status', ({ principal }) => {
      requireHttpPermission(principal, 'admin:access')
      return git.status()
    })
    .post('/api/git/sync', async ({ principal }) => {
      requireHttpPermission(principal, 'admin:access')
      const result = await git.sync(gitSyncHandlers)
      audit(logger, 'git.sync', {
        userId: principal?.id ?? null,
        upserted: result.upserted.length,
        deleted: result.deleted.length,
        pushed: result.pushed,
      })
      return result
    })
