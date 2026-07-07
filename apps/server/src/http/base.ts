import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import type { Principal } from '@ts-wiki/core'
import type { Env } from '../env.ts'
import type { Services } from '../services/index.ts'
import { toErrorResponse } from './errors.ts'
import type { RequestIpServer } from './rate-limit.ts'

export interface JwtVerifier {
  verify(token: string): Promise<unknown>
}

export interface BaseAppDeps {
  readonly env: Env
  readonly services: Services
  readonly corsOrigin: true | string[]
  readonly principalForToken: (jwt: JwtVerifier, token: string | null | undefined) => Promise<Principal | null>
  readonly enforcePrivateAnonymousReadLimit: (
    request: Request,
    server: RequestIpServer | null | undefined,
    principal: Principal | null,
  ) => void
  readonly requireAdminRoute: (request: Request, principal: Principal | null) => void
  readonly logRequest: (
    request: Request,
    server: RequestIpServer | null | undefined,
    status: number,
    principal?: Principal | null,
    error?: string,
  ) => void
  readonly logUnhandledError: (error: unknown) => void
  readonly markRequestStarted: (request: Request) => void
}

const bearerToken = (authorization: string | undefined): string | null =>
  authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

export const createBaseApp = ({
  env,
  services,
  corsOrigin,
  principalForToken,
  enforcePrivateAnonymousReadLimit,
  requireAdminRoute,
  logRequest,
  logUnhandledError,
  markRequestStarted,
}: BaseAppDeps) =>
  new Elysia()
    .use(cors({ origin: corsOrigin }))
    .use(jwt({ name: 'jwt', secret: env.jwtSecret }))
    .decorate('services', services)
    .onRequest(({ request }) => {
      markRequestStarted(request)
    })
    .resolve(async ({ jwt, headers }): Promise<{ principal: Principal | null }> => ({
      principal: await principalForToken(jwt, bearerToken(headers.authorization)),
    }))
    .onBeforeHandle(({ request, server, principal }) => {
      enforcePrivateAnonymousReadLimit(request, server, principal)
      requireAdminRoute(request, principal)
    })
    .onAfterHandle(({ request, server, set, principal }) => {
      const status = typeof set.status === 'number' ? set.status : 200
      logRequest(request, server, status, principal)
    })
    .onError(({ error, set, request, server }) => {
      const { status, body } = toErrorResponse(error)
      set.status = status
      if (status >= 500) logUnhandledError(error)
      logRequest(request, server, status, null, body.error.kind)
      return body
    })

export type BaseApp = ReturnType<typeof createBaseApp>
