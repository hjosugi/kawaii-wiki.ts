import { desc, lte, notInArray } from 'drizzle-orm'
import type { MysqlDb } from '../client.ts'
import { auditLog } from '../schema.ts'
import type { AuditLogRepository } from '../../../repositories/audit-log.ts'

/** MySQL implementation of the driver-neutral audit-log contract. */
export const createMysqlAuditLogRepository = (db: MysqlDb): AuditLogRepository => ({
  async record(entry, policy) {
    await db.insert(auditLog).values(entry)
    await db.delete(auditLog).where(lte(auditLog.createdAt, entry.createdAt - policy.retentionMs))
    // MySQL forbids referencing the delete target inside its own subquery (error
    // 1093 "you can't specify target table for update in FROM"), so the ids to
    // keep are materialized first and then excluded — the Postgres side can do
    // this in a single statement.
    const keep = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(policy.maxRows)
    if (keep.length > 0) {
      await db.delete(auditLog).where(notInArray(auditLog.id, keep.map((row) => row.id)))
    }
  },
})
