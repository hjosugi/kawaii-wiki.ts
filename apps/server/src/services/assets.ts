/**
 * Asset service — records uploaded-file metadata. The bytes live on disk under
 * DATA_DIR/assets and are served statically; this just tracks them.
 */
import { desc } from 'drizzle-orm'
import type { DB } from '../db/client.ts'
import { assets, type Asset } from '../db/schema.ts'

export interface RecordAssetInput {
  readonly filename: string
  readonly mime: string
  readonly size: number
  readonly authorId: string | null
}

export interface AssetService {
  record(input: RecordAssetInput): Asset
  list(): Asset[]
}

export const createAssetService = (db: DB): AssetService => ({
  record(input) {
    const asset: Asset = { id: crypto.randomUUID(), ...input, createdAt: Date.now() }
    db.insert(assets).values(asset).run()
    return asset
  },
  list() {
    return db.select().from(assets).orderBy(desc(assets.createdAt)).all()
  },
})
