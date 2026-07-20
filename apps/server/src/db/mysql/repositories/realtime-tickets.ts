import { eq, lte } from 'drizzle-orm'
import type { MysqlDb } from '../client.ts'
import { realtimeTickets } from '../schema.ts'
import type { RealtimeTicketRepository } from '../../../repositories/realtime-tickets.ts'

/** MySQL implementation of the driver-neutral realtime-ticket contract. */
export const createMysqlRealtimeTicketRepository = (db: MysqlDb): RealtimeTicketRepository => ({
  async cleanupExpired(now) {
    await db.delete(realtimeTickets).where(lte(realtimeTickets.expiresAt, now))
  },

  async insert(record) {
    await db.insert(realtimeTickets).values(record)
  },

  async consume(ticket) {
    // MySQL has no RETURNING, so the row is locked and read, then deleted inside
    // one transaction — a concurrent consume blocks on the lock and then finds
    // the row already gone, keeping a ticket single-use.
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ userId: realtimeTickets.userId, expiresAt: realtimeTickets.expiresAt })
        .from(realtimeTickets)
        .where(eq(realtimeTickets.ticket, ticket))
        .for('update')
        .limit(1)
      if (!row) return undefined
      await tx.delete(realtimeTickets).where(eq(realtimeTickets.ticket, ticket))
      return row
    })
  },
})
