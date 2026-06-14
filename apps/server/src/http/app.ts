/**
 * HTTP composition root. One chained Elysia instance so its type flows cleanly
 * into the Eden Treaty client (zero codegen). Cross-cutting concerns —
 * principal resolution, error mapping — are declared once here; handlers stay
 * thin and delegate to services.
 */
import { join } from 'node:path'
import { Elysia, t } from 'elysia'
import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import { staticPlugin } from '@elysiajs/static'
import {
  type Principal,
  type Role,
  can,
  forbidden,
  unauthorized,
} from '@wiki/core'
import type { Env } from '../env.ts'
import type { DB } from '../db/client.ts'
import { createServices } from '../services/index.ts'
import { verifyPassword } from '../services/auth.ts'
import type { User } from '../db/schema.ts'
import { HttpError, unwrap, toErrorResponse } from './errors.ts'

export interface AppDeps {
  readonly db: DB
  readonly env: Env
}

const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
})

const asRole = (value: unknown): Role | null =>
  value === 'admin' || value === 'editor' || value === 'viewer' ? value : null

export const createApp = ({ db, env }: AppDeps) => {
  const services = createServices(db)

  return (
    new Elysia()
      // Permissive CORS: the SPA uses Bearer tokens (not cookies), so it can run
      // on any localhost port without a fixed allowed-origin.
      .use(cors())
      .use(jwt({ name: 'jwt', secret: env.jwtSecret }))
      .use(staticPlugin({ assets: join(env.dataDir, 'assets'), prefix: '/assets' }))
      .decorate('services', services)
      // Resolve the current principal from a Bearer token on every request.
      .resolve(async ({ jwt, headers }): Promise<{ principal: Principal | null }> => {
        const auth = headers.authorization
        if (!auth?.startsWith('Bearer ')) return { principal: null }
        const payload = await jwt.verify(auth.slice(7))
        const role = payload ? asRole((payload as Record<string, unknown>).role) : null
        if (!payload || typeof payload.sub !== 'string' || !role) return { principal: null }
        return { principal: { id: payload.sub, role } }
      })
      .onError(({ error, set }) => {
        const { status, body } = toErrorResponse(error)
        set.status = status
        return body
      })

      // ── Health ────────────────────────────────────────────────────────────
      .get('/api/health', () => ({ ok: true as const, name: 'open-wiki', version: '0.1.0' }))

      // ── Auth ──────────────────────────────────────────────────────────────
      .post(
        '/api/auth/register',
        async ({ body, services, jwt }) => {
          // Bootstrap: the very first account becomes the admin.
          const role: Role = services.users.count() === 0 ? 'admin' : 'editor'
          const user = unwrap(await services.users.create({ ...body, role }))
          const token = await jwt.sign({ sub: user.id, role: user.role })
          return { token, user: publicUser(user) }
        },
        {
          body: t.Object({
            email: t.String({ minLength: 3 }),
            name: t.String({ minLength: 1 }),
            password: t.String({ minLength: 6 }),
          }),
        },
      )
      .post(
        '/api/auth/login',
        async ({ body, services, jwt }) => {
          const user = services.users.findByEmail(body.email)
          if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
            throw new HttpError(unauthorized('Invalid email or password'))
          }
          const token = await jwt.sign({ sub: user.id, role: user.role })
          return { token, user: publicUser(user) }
        },
        { body: t.Object({ email: t.String(), password: t.String() }) },
      )
      .get('/api/auth/me', ({ principal, services }) => {
        if (!principal) throw new HttpError(unauthorized())
        const user = services.users.findById(principal.id)
        if (!user) throw new HttpError(unauthorized())
        return { user: publicUser(user) }
      })

      // ── Pages: collection ─────────────────────────────────────────────────
      .get('/api/pages', ({ services }) => ({ pages: services.pages.list() }))
      .post(
        '/api/pages',
        ({ body, services, principal }) => ({ page: unwrap(services.pages.create(body, principal)) }),
        {
          body: t.Object({
            path: t.String(),
            title: t.String(),
            content: t.String(),
            description: t.Optional(t.String()),
          }),
        },
      )

      // ── Pages: single (path is a query param so it may contain slashes) ───
      .get(
        '/api/page',
        ({ query, services }) => ({ page: unwrap(services.pages.getByPath(query.path)) }),
        { query: t.Object({ path: t.String() }) },
      )
      .put(
        '/api/page',
        ({ query, body, services, principal }) => ({
          page: unwrap(services.pages.update(query.path, body, principal)),
        }),
        {
          query: t.Object({ path: t.String() }),
          body: t.Object({
            title: t.Optional(t.String()),
            content: t.Optional(t.String()),
            description: t.Optional(t.String()),
          }),
        },
      )
      .delete(
        '/api/page',
        ({ query, services, principal }) => unwrap(services.pages.remove(query.path, principal)),
        { query: t.Object({ path: t.String() }) },
      )

      // ── Search ────────────────────────────────────────────────────────────
      .get('/api/search', ({ query, services }) => services.search.search(query.q ?? '', query.limit), {
        query: t.Object({
          q: t.Optional(t.String()),
          limit: t.Optional(t.Numeric()),
        }),
      })

      // ── Assets ────────────────────────────────────────────────────────────
      .post(
        '/api/assets',
        async ({ body, services, principal }) => {
          if (!can(principal, 'page:write')) throw new HttpError(forbidden())
          const file = body.file
          const safeName = `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
          await Bun.write(join(env.dataDir, 'assets', safeName), file)
          const asset = services.assets.record({
            filename: file.name,
            mime: file.type,
            size: file.size,
            authorId: principal?.id ?? null,
          })
          return { id: asset.id, filename: asset.filename, url: `/assets/${safeName}` }
        },
        { body: t.Object({ file: t.File() }) },
      )
  )
}

export type App = ReturnType<typeof createApp>
