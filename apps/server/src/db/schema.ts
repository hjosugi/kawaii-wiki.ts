/**
 * Drizzle schema — the typed surface for database queries. Column types flow
 * from here into the services, out through Elysia routes, and via Eden Treaty
 * all the way into the Vue app, with no codegen step.
 *
 * NOTE: the actual DDL (including the FTS5 virtual table, which Drizzle can't
 * express) lives in ./migrate.ts and is kept in sync with these definitions.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] })
    .notNull()
    .default('viewer'),
  createdAt: integer('created_at').notNull(),
})

export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey(),
    path: text('path').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    content: text('content').notNull().default(''),
    renderedHtml: text('rendered_html').notNull().default(''),
    toc: text('toc').notNull().default('[]'),
    contentType: text('content_type').notNull().default('markdown'),
    lifecycle: text('lifecycle', { enum: ['active', 'archived', 'deleted'] })
      .notNull()
      .default('active'),
    status: text('status', { enum: ['draft', 'in-review', 'verified', 'outdated'] })
      .notNull()
      .default('draft'),
    labels: text('labels').notNull().default('[]'),
    ownerId: text('owner_id'),
    reviewAt: integer('review_at'),
    spaceKey: text('space_key').notNull().default('main'),
    locale: text('locale').notNull().default('und'),
    authorId: text('author_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('pages_updated_idx').on(t.updatedAt)],
)

export const pageRevisions = sqliteTable(
  'page_revisions',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id').notNull(),
    path: text('path').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    content: text('content').notNull().default(''),
    authorId: text('author_id'),
    action: text('action', { enum: ['created', 'updated', 'moved', 'deleted', 'archived', 'restored', 'purged'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('revisions_page_idx').on(t.pageId)],
)

export const pageComments = sqliteTable(
  'page_comments',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id').notNull(),
    path: text('path').notNull(),
    body: text('body').notNull(),
    authorId: text('author_id'),
    resolvedAt: integer('resolved_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('comments_page_idx').on(t.pageId), index('comments_path_idx').on(t.path)],
)

export const pageAnalytics = sqliteTable('page_analytics', {
  path: text('path').primaryKey(),
  views: integer('views').notNull().default(0),
  lastViewedAt: integer('last_viewed_at'),
})

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  storageName: text('storage_name').notNull().default(''),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  authorId: text('author_id'),
  createdAt: integer('created_at').notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Page = typeof pages.$inferSelect
export type NewPage = typeof pages.$inferInsert
export type PageRevision = typeof pageRevisions.$inferSelect
export type PageComment = typeof pageComments.$inferSelect
export type PageAnalytics = typeof pageAnalytics.$inferSelect
export type SiteSetting = typeof siteSettings.$inferSelect
export type Asset = typeof assets.$inferSelect
