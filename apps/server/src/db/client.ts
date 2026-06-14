/**
 * Database client factory. Returns a Drizzle instance (typed queries) with the
 * raw `bun:sqlite` handle attached for the few hand-written FTS5 queries.
 *
 * A factory — not a module-level singleton — so tests can spin up an in-memory
 * database and inject it. This is the dependency-injection seam the whole app
 * is built around (contrast Wiki.js's global `WIKI.db`).
 */
import { Database } from 'bun:sqlite'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema.ts'
import { runMigrations } from './migrate.ts'

export type DB = BunSQLiteDatabase<typeof schema> & { readonly $client: Database }

export interface CreateDbOptions {
  /** Run migrations on open. Default true. */
  readonly migrate?: boolean
}

export const createDb = (path: string, options: CreateDbOptions = {}): DB => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  if (options.migrate !== false) runMigrations(sqlite)
  const db = drizzle(sqlite, { schema }) as DB
  return Object.assign(db, { $client: sqlite })
}
