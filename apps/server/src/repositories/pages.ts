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
