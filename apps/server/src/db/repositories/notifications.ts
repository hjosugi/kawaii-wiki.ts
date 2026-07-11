import { and, desc, eq } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { notifications, pages, pageWatchers, users } from '../schema.ts'
import type { NotificationRepository } from '../../repositories/notifications.ts'

export const createSqliteNotificationRepository = (db: DB): NotificationRepository => ({
  async listByUser(userId, limit) {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .all()
  },

  async markRead(userId, id, readAt) {
    const where = id
      ? and(eq(notifications.userId, userId), eq(notifications.id, id))
      : eq(notifications.userId, userId)
    db.update(notifications).set({ readAt }).where(where).run()
  },

  async findPage(path) {
    return db.select({
      path: pages.path,
      title: pages.title,
      status: pages.status,
      publishAt: pages.publishAt,
      ownerId: pages.ownerId,
      authorId: pages.authorId,
    }).from(pages).where(eq(pages.path, path)).get()
  },

  async listUsers() {
    return db.select({ id: users.id, email: users.email, name: users.name }).from(users).all()
  },

  async insert(notification) {
    db.insert(notifications).values(notification).run()
  },

  async setWatching(userId, path, watching, createdAt) {
    if (watching) {
      db.insert(pageWatchers).values({ userId, path, createdAt }).onConflictDoNothing().run()
      return
    }
    db.delete(pageWatchers)
      .where(and(eq(pageWatchers.userId, userId), eq(pageWatchers.path, path)))
      .run()
  },

  async isWatching(userId, path) {
    return Boolean(db.select({ userId: pageWatchers.userId }).from(pageWatchers)
      .where(and(eq(pageWatchers.userId, userId), eq(pageWatchers.path, path)))
      .get())
  },

  async listWatchers(path) {
    return db.select().from(pageWatchers).where(eq(pageWatchers.path, path)).all()
  },

  async moveWatchers(fromPath, toPath) {
    db.transaction((tx) => {
      const watchers = tx.select().from(pageWatchers).where(eq(pageWatchers.path, fromPath)).all()
      for (const watcher of watchers) {
        tx.insert(pageWatchers).values({ ...watcher, path: toPath }).onConflictDoNothing().run()
      }
      tx.delete(pageWatchers).where(eq(pageWatchers.path, fromPath)).run()
    })
  },

  async deleteWatchers(path) {
    db.delete(pageWatchers).where(eq(pageWatchers.path, path)).run()
  },
})
