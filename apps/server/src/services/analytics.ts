import { desc, eq, gte, sql } from 'drizzle-orm'
import { type AppError, type Principal, type Result, ok, requirePermission } from '@kawaii-wiki/core'
import type { DB } from '../db/client.ts'
import { pageAnalytics } from '../db/schema.ts'
import { unrefTimer } from '../utils/timers.ts'

export interface PageInsight {
  readonly path: string
  readonly views: number
  readonly lastViewedAt: number | null
}

export interface AnalyticsSummary {
  readonly totalViews: number
  readonly topPages: PageInsight[]
}

export interface AnalyticsService {
  recordPageView(path: string, principal: Principal | null): Result<void, AppError>
  page(path: string): PageInsight
  summary(principal: Principal | null, limit?: number): Result<AnalyticsSummary, AppError>
  popular(days?: number, limit?: number): PageInsight[]
  flush(): void
}

export const createAnalyticsService = (db: DB): AnalyticsService => {
  const pending = new Map<string, { views: number; lastViewedAt: number }>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const upsert = db.$client.prepare(`
    INSERT INTO page_analytics(path, views, last_viewed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      views = views + excluded.views,
      last_viewed_at = excluded.last_viewed_at
  `)

  const flush = (): void => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    const batch = [...pending.entries()]
    pending.clear()
    if (!batch.length) return
    db.transaction(() => {
      for (const [path, value] of batch) upsert.run(path, value.views, value.lastViewedAt)
    })
  }

  const flushBestEffort = (): void => {
    try {
      flush()
    } catch {
      // A buffered view is intentionally lossy. In particular, an application
      // instance may have shut down and closed its database before this timer.
    }
  }

  const scheduleFlush = (): void => {
    if (flushTimer) return
    flushTimer = setTimeout(flushBestEffort, 1_000)
    unrefTimer(flushTimer)
  }

  return {
    recordPageView(path, principal) {
      const allowed = requirePermission(principal, 'page:read', { path })
      if (!allowed.ok) return allowed
      const recordedAt = Date.now()
      const current = pending.get(path)
      pending.set(path, { views: (current?.views ?? 0) + 1, lastViewedAt: recordedAt })
      scheduleFlush()
      return ok(undefined)
    },
    page(path) {
      const persisted = db
        .select({
          path: pageAnalytics.path,
          views: pageAnalytics.views,
          lastViewedAt: pageAnalytics.lastViewedAt,
        })
        .from(pageAnalytics)
        .where(eq(pageAnalytics.path, path))
        .get() ?? { path, views: 0, lastViewedAt: null }
      const buffered = pending.get(path)
      return buffered
        ? { path, views: persisted.views + buffered.views, lastViewedAt: buffered.lastViewedAt }
        : persisted
    },
    summary(principal, limit = 10) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      flush()
      const totalViews =
        db.select({ total: sql<number>`coalesce(sum(${pageAnalytics.views}), 0)` }).from(pageAnalytics).get()
          ?.total ?? 0
      const topPages = db
        .select({
          path: pageAnalytics.path,
          views: pageAnalytics.views,
          lastViewedAt: pageAnalytics.lastViewedAt,
        })
        .from(pageAnalytics)
        .orderBy(desc(pageAnalytics.views), desc(pageAnalytics.lastViewedAt))
        .limit(limit)
        .all()
      return ok({ totalViews, topPages })
    },
    popular(days = 7, limit = 10) {
      flush()
      const cappedDays = Math.min(Math.max(Math.trunc(days), 1), 365)
      const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50)
      const cutoff = Date.now() - cappedDays * 24 * 60 * 60 * 1000
      return db
        .select({
          path: pageAnalytics.path,
          views: pageAnalytics.views,
          lastViewedAt: pageAnalytics.lastViewedAt,
        })
        .from(pageAnalytics)
        .where(gte(pageAnalytics.lastViewedAt, cutoff))
        .orderBy(desc(pageAnalytics.views), desc(pageAnalytics.lastViewedAt))
        .limit(cappedLimit)
        .all()
    },
    flush,
  }
}
