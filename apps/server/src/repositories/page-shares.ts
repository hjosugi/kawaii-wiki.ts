import type { PageRecord } from './pages.ts'

export interface PageShareRecord {
  readonly token: string
  readonly path: string
  readonly createdBy: string
  readonly expiresAt: number | null
  readonly revokedAt: number | null
  readonly createdAt: number
}

export class DuplicatePageShareTokenError extends Error {
  constructor() {
    super('Page share token already exists')
    this.name = 'DuplicatePageShareTokenError'
  }
}

export interface PageShareRepository {
  findActivePage(path: string): Promise<PageRecord | undefined>
  findByToken(token: string): Promise<PageShareRecord | undefined>
  findActiveForPath(path: string, now: number): Promise<PageShareRecord | undefined>
  insert(share: PageShareRecord): Promise<void>
  revoke(token: string, revokedAt: number): Promise<PageShareRecord | undefined>
}
