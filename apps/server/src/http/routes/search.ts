import { t } from 'elysia'
import { can, type Principal } from '@ts-wiki/core'
import type { BaseApp } from '../base.ts'

export interface SearchRoutesContext {
  readonly requireSearchRead: (principal: Principal | null) => void
}

export const createSearchRoutes = ({ requireSearchRead }: SearchRoutesContext) => (app: BaseApp) =>
  app.get('/api/search', ({ query, services, principal }) => {
    requireSearchRead(principal)
    return services.search.search(
      query.q ?? '',
      query.limit,
      {
        pathPrefix: query.pathPrefix,
        label: query.label,
        status: query.status,
        spaceKey: query.spaceKey,
        locale: query.locale,
      },
      (path) => can(principal, 'page:read', { path }),
    )
  }, {
    query: t.Object({
      q: t.Optional(t.String()),
      limit: t.Optional(t.Numeric()),
      pathPrefix: t.Optional(t.String()),
      label: t.Optional(t.String()),
      status: t.Optional(t.String()),
      spaceKey: t.Optional(t.String()),
      locale: t.Optional(t.String()),
    }),
  })
