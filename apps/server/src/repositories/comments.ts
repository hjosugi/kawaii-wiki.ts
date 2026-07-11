export interface CommentRecord {
  readonly id: string
  readonly pageId: string
  readonly path: string
  readonly body: string
  readonly authorId: string | null
  readonly resolvedAt: number | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface CommentPageRecord {
  readonly id: string
  readonly path: string
  readonly labels: string
}

export interface CommentWithAuthorRecord {
  readonly comment: CommentRecord
  readonly authorName: string | null
}

export interface CommentRepository {
  findActivePage(path: string): Promise<CommentPageRecord | undefined>
  findById(id: string): Promise<CommentRecord | undefined>
  listByPageId(pageId: string): Promise<CommentWithAuthorRecord[]>
  findAuthorName(userId: string): Promise<string | null>
  insert(comment: CommentRecord): Promise<void>
  updateBody(id: string, body: string, updatedAt: number): Promise<boolean>
  resolve(id: string, resolvedAt: number, updatedAt: number): Promise<boolean>
  delete(id: string): Promise<boolean>
}
