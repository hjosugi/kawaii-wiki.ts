export interface AssetRecord {
  readonly id: string
  readonly filename: string
  readonly storageName: string
  readonly folder: string
  readonly mime: string
  readonly size: number
  readonly authorId: string | null
  readonly createdAt: number
  readonly deletedAt: number | null
}

export interface AssetPageRecord {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly content: string
}

export interface PageAssetReferenceRecord {
  readonly pageId: string
  readonly assetId: string
}

export interface AssetRepository {
  listActive(folder?: string): Promise<AssetRecord[]>
  listDeleted(): Promise<AssetRecord[]>
  findActive(id: string): Promise<AssetRecord | undefined>
  findDeleted(id: string): Promise<AssetRecord | undefined>
  listActivePages(): Promise<AssetPageRecord[]>
  listReferences(pageIds: readonly string[]): Promise<PageAssetReferenceRecord[]>
  insertReferences(pageIds: readonly string[], assetId: string): Promise<void>
  listAffectedPageIds(assetId: string): Promise<string[]>
  listAccessPaths(storageName: string): Promise<string[]>
  insert(record: AssetRecord): Promise<void>
  update(id: string, changes: Partial<Pick<AssetRecord, 'filename' | 'folder' | 'deletedAt'>>): Promise<void>
  delete(id: string): Promise<void>
}
