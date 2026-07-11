import type { PageStatus } from './pages.ts'

export interface NotificationRecord {
  readonly id: string
  readonly userId: string
  readonly kind: string
  readonly path: string | null
  readonly message: string
  readonly payload: string
  readonly readAt: number | null
  readonly createdAt: number
}

export interface NotificationPageRecord {
  readonly path: string
  readonly title: string
  readonly status: PageStatus
  readonly publishAt: number | null
  readonly ownerId: string | null
  readonly authorId: string | null
}

export interface NotificationUserRecord {
  readonly id: string
  readonly email: string
  readonly name: string
}

export interface PageWatcherRecord {
  readonly userId: string
  readonly path: string
  readonly createdAt: number
}

export interface NotificationRepository {
  listByUser(userId: string, limit: number): Promise<NotificationRecord[]>
  markRead(userId: string, id: string | undefined, readAt: number): Promise<void>
  findPage(path: string): Promise<NotificationPageRecord | undefined>
  listUsers(): Promise<NotificationUserRecord[]>
  insert(notification: NotificationRecord): Promise<void>
  setWatching(userId: string, path: string, watching: boolean, createdAt: number): Promise<void>
  isWatching(userId: string, path: string): Promise<boolean>
  listWatchers(path: string): Promise<PageWatcherRecord[]>
  moveWatchers(fromPath: string, toPath: string): Promise<void>
  deleteWatchers(path: string): Promise<void>
}
