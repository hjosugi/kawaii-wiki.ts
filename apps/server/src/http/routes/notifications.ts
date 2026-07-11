import { t } from 'elysia'
import { unwrap } from '../errors.ts'
import type { BaseApp } from '../base.ts'

export const createNotificationRoutes = () => (app: BaseApp) =>
  app
    .get('/api/notifications', async ({ query, services, principal }) =>
      unwrap(await services.notifications.list(principal, query.limit)), {
      query: t.Object({ limit: t.Optional(t.Numeric()) }),
    })
    .post('/api/notifications/read', async ({ body, services, principal }) =>
      unwrap(await services.notifications.markRead(principal, body.id)), {
      body: t.Object({ id: t.Optional(t.String()) }),
    })
    .get('/api/page/watch', async ({ query, services, principal }) =>
      unwrap(await services.notifications.watching(principal, query.path)), {
      query: t.Object({ path: t.String() }),
    })
    .post('/api/page/watch', async ({ body, services, principal }) =>
      unwrap(await services.notifications.watch(principal, body.path, body.watching)), {
      body: t.Object({ path: t.String(), watching: t.Boolean() }),
    })
