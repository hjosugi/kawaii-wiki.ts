/**
 * Schema DDL — including the FTS5 full-text index that Drizzle can't express.
 *
 * The pattern, learned from Wiki.js's PostgreSQL `tsvector` setup: weight the
 * title above the description above the body, and keep the search index in sync
 * with the source rows. Here we do that with a standalone FTS5 table that the
 * PageService updates inside the same transaction as the page write — explicit
 * effects, no hidden triggers.
 */
import { Database } from 'bun:sqlite'

/** FTS5 tokenizer. `unicode61` ranks prose well; switch to `trigram` for
 *  substring/CJK-heavy content (see README "Search"). */
export const FTS_TOKENIZER = "unicode61 remove_diacritics 2"

const hasColumn = (sqlite: Database, table: string, column: string): boolean =>
  sqlite
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column)

const addColumn = (sqlite: Database, table: string, column: string, definition: string): void => {
  if (!hasColumn(sqlite, table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`)
  }
}

export const runMigrations = (sqlite: Database): void => {
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
      id            TEXT PRIMARY KEY,
      path          TEXT NOT NULL UNIQUE,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      content       TEXT NOT NULL DEFAULT '',
      rendered_html TEXT NOT NULL DEFAULT '',
      toc           TEXT NOT NULL DEFAULT '[]',
      content_type  TEXT NOT NULL DEFAULT 'markdown',
      lifecycle     TEXT NOT NULL DEFAULT 'active',
      status        TEXT NOT NULL DEFAULT 'draft',
      labels        TEXT NOT NULL DEFAULT '[]',
      owner_id      TEXT,
      review_at     INTEGER,
      space_key     TEXT NOT NULL DEFAULT 'main',
      locale        TEXT NOT NULL DEFAULT 'und',
      author_id     TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pages_updated_idx ON pages(updated_at);

    CREATE TABLE IF NOT EXISTS page_revisions (
      id          TEXT PRIMARY KEY,
      page_id     TEXT NOT NULL,
      path        TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      author_id   TEXT,
      action      TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS revisions_page_idx ON page_revisions(page_id);

    CREATE TABLE IF NOT EXISTS page_comments (
      id          TEXT PRIMARY KEY,
      page_id     TEXT NOT NULL,
      path        TEXT NOT NULL,
      body        TEXT NOT NULL,
      author_id   TEXT,
      resolved_at INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS comments_page_idx ON page_comments(page_id);
    CREATE INDEX IF NOT EXISTS comments_path_idx ON page_comments(path);

    CREATE TABLE IF NOT EXISTS page_analytics (
      path           TEXT PRIMARY KEY,
      views          INTEGER NOT NULL DEFAULT 0,
      last_viewed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id         TEXT PRIMARY KEY,
      filename   TEXT NOT NULL,
      storage_name TEXT NOT NULL DEFAULT '',
      mime       TEXT NOT NULL,
      size       INTEGER NOT NULL,
      author_id  TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wiki_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id  TEXT NOT NULL,
      event_type TEXT NOT NULL,
      action     TEXT NOT NULL,
      path       TEXT NOT NULL,
      from_path  TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wiki_events_id_idx ON wiki_events(id);
  `)

  // Full-text search index. Columns: page_id (returned, not searched), then the
  // three weighted text columns. `plain_text` holds the de-marked-down body.
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      page_id UNINDEXED,
      title,
      description,
      content,
      tokenize = '${FTS_TOKENIZER}'
    );
  `)

  addColumn(sqlite, 'pages', 'lifecycle', "TEXT NOT NULL DEFAULT 'active'")
  addColumn(sqlite, 'pages', 'status', "TEXT NOT NULL DEFAULT 'draft'")
  addColumn(sqlite, 'pages', 'labels', "TEXT NOT NULL DEFAULT '[]'")
  addColumn(sqlite, 'pages', 'owner_id', 'TEXT')
  addColumn(sqlite, 'pages', 'review_at', 'INTEGER')
  addColumn(sqlite, 'pages', 'space_key', "TEXT NOT NULL DEFAULT 'main'")
  addColumn(sqlite, 'pages', 'locale', "TEXT NOT NULL DEFAULT 'und'")
  addColumn(sqlite, 'assets', 'storage_name', "TEXT NOT NULL DEFAULT ''")
}

/** Run migrations standalone: `bun src/db/migrate.ts`. */
if (import.meta.main) {
  const { loadEnv } = await import('../env.ts')
  const env = loadEnv()
  const { dirname } = await import('node:path')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(dirname(env.databasePath), { recursive: true })
  const sqlite = new Database(env.databasePath, { create: true })
  runMigrations(sqlite)
  sqlite.close()
  console.log(`✓ Migrations applied to ${env.databasePath}`)
}
