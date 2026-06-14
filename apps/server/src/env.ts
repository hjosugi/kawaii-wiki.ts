/**
 * Typed runtime configuration. Read once, passed explicitly into the app
 * factory — no `process.env` reads scattered through the codebase, no globals.
 */
export interface Env {
  readonly port: number
  readonly databasePath: string
  readonly dataDir: string
  readonly jwtSecret: string
  readonly webOrigin: string
}

export const loadEnv = (): Env => ({
  port: Number(process.env.PORT ?? 4000),
  databasePath: process.env.DATABASE_PATH ?? './data/wiki.sqlite',
  dataDir: process.env.DATA_DIR ?? './data',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
})
