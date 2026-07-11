import { err, normalizePath, notFound, ok, type AppError, type Principal, type Result, unauthorized, requirePermission } from '@kawaii-wiki/core'
import type { NotificationRecord, NotificationRepository } from '../repositories/notifications.ts'
import type { CommentView } from './comments.ts'

export interface NotificationView {
  readonly id: string
  readonly kind: string
  readonly path: string | null
  readonly message: string
  readonly payload: Record<string, unknown>
  readonly readAt: number | null
  readonly createdAt: number
}

export interface NotificationList {
  readonly notifications: NotificationView[]
  readonly unread: number
}

export interface NotificationService {
  list(principal: Principal | null, limit?: number): Promise<Result<NotificationList, AppError>>
  markRead(principal: Principal | null, id?: string): Promise<Result<{ readAt: number }, AppError>>
  watch(principal: Principal | null, path: string, watching: boolean): Promise<Result<{ path: string; watching: boolean }, AppError>>
  watching(principal: Principal | null, path: string): Promise<Result<{ path: string; watching: boolean }, AppError>>
  notifyComment(comment: CommentView): Promise<void>
  pageChanged(action: string, path: string, from: string | undefined, actorId: string | null): Promise<void>
}

const parsePayload = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export const createNotificationService = (repository: NotificationRepository): NotificationService => {
  const requireUser = (principal: Principal | null): Result<Principal, AppError> =>
    principal ? ok(principal) : err(unauthorized())

  const insert = async (userId: string, kind: string, path: string | null, message: string, payload: Record<string, unknown>): Promise<void> => {
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      userId,
      kind,
      path,
      message,
      payload: JSON.stringify(payload),
      readAt: null,
      createdAt: Date.now(),
    }
    await repository.insert(notification)
  }

  const requireVisiblePage = async (principal: Principal, path: string): Promise<Result<void, AppError>> => {
    const allowed = requirePermission(principal, 'page:read', { path })
    if (!allowed.ok) return allowed
    const page = await repository.findPage(path)
    if (!page) return err(notFound(`No page at "${path}"`))
    const unpublished = page.status === 'draft' || (page.publishAt !== null && page.publishAt > Date.now())
    if (unpublished && !requirePermission(principal, 'page:update', { path }).ok) {
      return err(notFound(`No page at "${path}"`))
    }
    return ok(undefined)
  }

  return {
    async list(principal, limit = 50) {
      const user = requireUser(principal)
      if (!user.ok) return user
      const capped = Math.min(Math.max(Math.trunc(limit), 1), 100)
      const rows = (await repository.listByUser(user.value.id, capped))
        .filter((row) => !row.path || requirePermission(principal, 'page:read', { path: row.path }).ok)
      const unread = rows.filter((row) => row.readAt === null).length
      return ok({
        notifications: rows.map((row) => ({ ...row, payload: parsePayload(row.payload) })),
        unread,
      })
    },

    async markRead(principal, id) {
      const user = requireUser(principal)
      if (!user.ok) return user
      const readAt = Date.now()
      await repository.markRead(user.value.id, id, readAt)
      return ok({ readAt })
    },

    async watch(principal, path, watching) {
      const user = requireUser(principal)
      if (!user.ok) return user
      const normalized = normalizePath(path)
      const allowed = await requireVisiblePage(user.value, normalized)
      if (!allowed.ok) return allowed
      await repository.setWatching(user.value.id, normalized, watching, Date.now())
      return ok({ path: normalized, watching })
    },

    async watching(principal, path) {
      const user = requireUser(principal)
      if (!user.ok) return user
      const normalized = normalizePath(path)
      const allowed = await requireVisiblePage(user.value, normalized)
      if (!allowed.ok) return allowed
      const watching = await repository.isWatching(user.value.id, normalized)
      return ok({ path: normalized, watching })
    },

    async notifyComment(comment) {
      const page = await repository.findPage(comment.path)
      if (!page) return
      const targets = new Set<string>()
      for (const user of await repository.listUsers()) {
        const aliases = [
          user.name.toLowerCase().replace(/\s+/g, '.'),
          user.name.toLowerCase().replace(/\s+/g, ''),
          user.email.split('@')[0]?.toLowerCase() ?? '',
        ]
        if (comment.mentions.some((mention) => aliases.includes(mention))) targets.add(user.id)
      }
      if (page.ownerId) targets.add(page.ownerId)
      if (page.authorId) targets.add(page.authorId)
      if (comment.authorId) targets.delete(comment.authorId)
      for (const userId of targets) {
        await insert(userId, 'comment', page.path, `${comment.authorName ?? 'Someone'} commented on ${page.title}`, { commentId: comment.id })
      }
    },

    async pageChanged(action, path, from, actorId) {
      if (from && from !== path) {
        await repository.moveWatchers(from, path)
      }
      const page = await repository.findPage(path)
      const title = page?.title ?? path
      const watchers = await repository.listWatchers(path)
      for (const watcher of watchers) {
        if (watcher.userId === actorId) continue
        await insert(watcher.userId, 'page', path, `${title} was ${action}`, { action, from: from ?? null })
      }
      if (action === 'deleted') await repository.deleteWatchers(path)
    },
  }
}
