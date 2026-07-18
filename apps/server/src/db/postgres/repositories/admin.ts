import { and, asc, desc, eq, gte, isNull, like, lte, sql, type SQL } from 'drizzle-orm'
import type { PostgresDb } from '../client.ts'
import { auditLog, groupMemberships, groups, pageRevisions, pages, users } from '../schema.ts'
import type { AdminRepository, AdminUserRecord } from '../../../repositories/admin.ts'

const userSelection = {
  id: users.id,
  email: users.email,
  name: users.name,
  passwordHash: users.passwordHash,
  role: users.role,
  disabledAt: users.disabledAt,
  tokenInvalidBefore: users.tokenInvalidBefore,
  createdAt: users.createdAt,
}

/** PostgreSQL implementation of the driver-neutral admin contract. */
export const createPostgresAdminRepository = (db: PostgresDb): AdminRepository => ({
  async stats() {
    const [u] = await db.select({ count: sql<number>`count(*)` }).from(users)
    const [p] = await db.select({ count: sql<number>`count(*)` }).from(pages)
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(pageRevisions)
    return { users: Number(u?.count ?? 0), pages: Number(p?.count ?? 0), revisions: Number(r?.count ?? 0) }
  },

  async historyStats() {
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(pageRevisions)
    const [b] = await db
      .select({
        bytes: sql<number>`coalesce(sum(length(${pageRevisions.title}) + length(${pageRevisions.description}) + length(${pageRevisions.content})), 0)::bigint`,
      })
      .from(pageRevisions)
    return { revisions: Number(r?.count ?? 0), historyBytes: Number(b?.bytes ?? 0) }
  },

  async listRevisionCandidates() {
    // SQLite tie-broke on rowid; Postgres has none, so use the id for a stable,
    // deterministic secondary order.
    return db
      .select({ id: pageRevisions.id, pageId: pageRevisions.pageId, createdAt: pageRevisions.createdAt })
      .from(pageRevisions)
      .orderBy(desc(pageRevisions.createdAt), desc(pageRevisions.id))
  },

  async deleteRevisions(ids) {
    await db.transaction(async (tx) => {
      for (const id of ids) await tx.delete(pageRevisions).where(eq(pageRevisions.id, id))
    })
  },

  async listPages(query) {
    const filters: SQL[] = [
      eq(pages.lifecycle, 'active'),
      ...(query.status ? [eq(pages.status, query.status)] : []),
      ...(query.label ? [like(pages.labels, `%${query.label}%`)] : []),
      ...(query.spaceKey ? [eq(pages.spaceKey, query.spaceKey)] : []),
      ...(query.authorId ? [eq(pages.authorId, query.authorId)] : []),
    ]
    const where = and(...filters)
    const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(pages).where(where)
    const rows = await db
      .select({
        path: pages.path,
        title: pages.title,
        status: pages.status,
        labels: pages.labels,
        ownerId: pages.ownerId,
        authorId: pages.authorId,
        authorName: users.name,
        spaceKey: pages.spaceKey,
        locale: pages.locale,
        updatedAt: pages.updatedAt,
      })
      .from(pages)
      .leftJoin(users, eq(users.id, pages.authorId))
      .where(where)
      .orderBy(desc(pages.updatedAt), asc(pages.path))
      .limit(query.limit)
      .offset(query.offset)
    return { rows: rows.map((row) => ({ ...row, authorName: row.authorName ?? null })), total: Number(totalRow?.count ?? 0) }
  },

  async listAudit(query) {
    const filters: SQL[] = [
      ...(query.action ? [like(auditLog.action, `%${query.action}%`)] : []),
      ...(query.userId ? [eq(auditLog.userId, query.userId)] : []),
      ...(query.from !== undefined ? [gte(auditLog.createdAt, query.from)] : []),
      ...(query.to !== undefined ? [lte(auditLog.createdAt, query.to)] : []),
    ]
    const where = filters.length ? and(...filters) : undefined
    const totalBase = db.select({ count: sql<number>`count(*)` }).from(auditLog)
    const [totalRow] = await (where ? totalBase.where(where) : totalBase)
    const rowsBase = db.select().from(auditLog)
    const rows = await (where ? rowsBase.where(where) : rowsBase)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(query.limit)
      .offset(query.offset)
    return { rows, total: Number(totalRow?.count ?? 0) }
  },

  async listUsers() {
    return (await db.select(userSelection).from(users).orderBy(asc(users.createdAt))) as AdminUserRecord[]
  },

  async listGroupMemberships() {
    return db
      .select({ userId: groupMemberships.userId, key: groups.key })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
  },

  async findUser(id) {
    const [row] = await db.select(userSelection).from(users).where(eq(users.id, id)).limit(1)
    return row as AdminUserRecord | undefined
  },

  async activeAdminCount() {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
    return Number(row?.count ?? 0)
  },

  async updateUserRole(id, role) {
    await db.update(users).set({ role }).where(eq(users.id, id))
  },

  async updateUserPassword(id, passwordHash, tokenInvalidBefore) {
    await db.update(users).set({ passwordHash, tokenInvalidBefore }).where(eq(users.id, id))
  },

  async deactivateUser(id, disabledAt) {
    await db.update(users).set({ disabledAt, tokenInvalidBefore: disabledAt }).where(eq(users.id, id))
  },
})
