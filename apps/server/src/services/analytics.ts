import { desc, sql } from 'drizzle-orm'
import type { DB } from '../db/client.ts'
import { pageAnalytics } from '../db/schema.ts'

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
  recordPageView(path: string): void
  summary(limit?: number): AnalyticsSummary
}

export const createAnalyticsService = (db: DB): AnalyticsService => {
  const upsert = db.$client.prepare(`
    INSERT INTO page_analytics(path, views, last_viewed_at)
    VALUES (?, 1, ?)
    ON CONFLICT(path) DO UPDATE SET
      views = views + 1,
      last_viewed_at = excluded.last_viewed_at
  `)

  return {
    recordPageView(path) {
      upsert.run(path, Date.now())
    },
    summary(limit = 10) {
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
      return { totalViews, topPages }
    },
  }
}
