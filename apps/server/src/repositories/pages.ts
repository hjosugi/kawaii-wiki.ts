export type PageLifecycle = 'active' | 'archived' | 'deleted'
export type PageStatus = 'draft' | 'in-review' | 'verified' | 'outdated'

export interface PageRecord {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly description: string
  readonly icon: string
  readonly coverUrl: string
  readonly coverPosition: string
  readonly content: string
  readonly renderedHtml: string
  readonly toc: string
  readonly contentType: string
  readonly lifecycle: PageLifecycle
  readonly status: PageStatus
  readonly labels: string
  readonly ownerId: string | null
  readonly reviewAt: number | null
  readonly publishAt: number | null
  readonly navOrder: number | null
  readonly pinned: boolean
  readonly spaceKey: string
  readonly locale: string
  readonly authorId: string | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface PageRevisionWithAuthorRecord {
  readonly id: string
  readonly pageId?: string
  readonly path: string
  readonly title: string
  readonly description?: string
  readonly content?: string
  readonly authorId: string | null
  readonly authorName: string | null
  readonly action: 'created' | 'updated' | 'moved' | 'deleted' | 'archived' | 'restored' | 'purged'
  readonly createdAt: number
}

export interface PageRedirectRecord {
  readonly fromPath: string
  readonly toPath: string
  readonly createdAt: number
}

export interface PageRevisionContributorRecord {
  readonly authorId: string | null
  readonly authorName: string | null
  readonly revisions: number
  readonly lastContributionAt: number
}

export interface PageReadRepository {
  listActive(): Promise<PageRecord[]>
  listInactive(): Promise<PageRecord[]>
  listRecentRevisions(before: number | null, limit: number): Promise<PageRevisionWithAuthorRecord[]>
  listRedirects(): Promise<PageRedirectRecord[]>
  listRevisions(pageId: string): Promise<PageRevisionWithAuthorRecord[]>
  revisionContributors(pageId: string): Promise<PageRevisionContributorRecord[]>
}

export class DuplicatePagePathError extends Error {
  constructor() {
    super('Page path already exists')
    this.name = 'DuplicatePagePathError'
  }
}

export interface PageRevisionRecord {
  readonly id: string
  readonly pageId: string
  readonly path: string
  readonly title: string
  readonly description: string
  readonly content: string
  readonly authorId: string | null
  readonly action: PageRevisionWithAuthorRecord['action']
  readonly createdAt: number
}

export interface ExistingPageWrite {
  readonly pageId: string
  readonly changes: Partial<Omit<PageRecord, 'id'>>
  readonly revision: PageRevisionRecord | null
}

export interface PageLifecycleWrite {
  readonly pageId: string
  readonly lifecycle: PageLifecycle
  readonly updatedAt: number
  readonly revision: PageRevisionRecord
  readonly index: boolean
}

export interface RewrittenPageWrite {
  readonly pageId: string
  readonly content: string
  readonly renderedHtml: string
  readonly toc: string
  readonly updatedAt: number
  readonly revision: PageRevisionRecord
}

export interface MovePageWrite {
  readonly pageId: string
  readonly oldPath: string
  readonly newPath: string
  readonly spaceKey: string
  readonly updatedAt: number
  readonly revision: PageRevisionRecord
  readonly rewrittenPages: readonly RewrittenPageWrite[]
}

export interface RemovePageWrite {
  readonly pageId: string
  readonly path: string
  readonly updatedAt: number
  readonly revision: PageRevisionRecord
}

export interface PageWriteRepository {
  findByPath(path: string): Promise<PageRecord | undefined>
  findById(id: string): Promise<PageRecord | undefined>
  findRevision(id: string): Promise<PageRevisionRecord | undefined>
  findRedirect(path: string): Promise<string | null>
  writeExisting(input: ExistingPageWrite): Promise<PageRecord | undefined>
  create(page: PageRecord, revision: PageRevisionRecord): Promise<PageRecord | undefined>
  createRedirect(record: PageRedirectRecord): Promise<void>
  deleteRedirect(fromPath: string): Promise<void>
  setLifecycle(input: PageLifecycleWrite): Promise<PageRecord | undefined>
  move(input: MovePageWrite): Promise<PageRecord | undefined>
  remove(input: RemovePageWrite): Promise<PageRecord | undefined>
  purge(pageId: string, path: string): Promise<void>
}
