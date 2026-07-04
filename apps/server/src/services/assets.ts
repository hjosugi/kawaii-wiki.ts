/**
 * Asset service — records uploaded-file metadata. The bytes live on disk under
 * DATA_DIR/assets and are served statically; this just tracks them.
 */
import { eq, desc } from 'drizzle-orm'
import type { DB } from '../db/client.ts'
import { assets, type Asset } from '../db/schema.ts'

export const ASSET_MAX_SIZE = '5m' as const
export const ASSET_MAX_BYTES = 5 * 1024 * 1024
export const ALLOWED_ASSET_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const

type AllowedAssetMime = (typeof ALLOWED_ASSET_MIME_TYPES)[number]

const ASSET_EXTENSIONS: Record<AllowedAssetMime, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
}

export const assetExtensionForMime = (mime: string): string | null =>
  ALLOWED_ASSET_MIME_TYPES.includes(mime as AllowedAssetMime)
    ? ASSET_EXTENSIONS[mime as AllowedAssetMime]
    : null

export const safeAssetStorageName = (file: File, id = crypto.randomUUID()): string => {
  const stem =
    file.name
      .replace(/\.[^.]*$/, '')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'upload'
  const extension = assetExtensionForMime(file.type) ?? '.bin'
  return `${id}-${stem}${extension}`
}

export interface RecordAssetInput {
  readonly id?: string
  readonly filename: string
  readonly storageName: string
  readonly mime: string
  readonly size: number
  readonly authorId: string | null
}

export interface AssetView {
  readonly id: string
  readonly filename: string
  readonly storageName: string
  readonly mime: string
  readonly size: number
  readonly authorId: string | null
  readonly createdAt: number
  readonly url: string
}

export interface AssetService {
  record(input: RecordAssetInput): AssetView
  list(): AssetView[]
  findById(id: string): AssetView | null
  rename(id: string, filename: string): AssetView | null
  remove(id: string): AssetView | null
}

const toView = (asset: Asset): AssetView => ({
  ...asset,
  url: `/assets/${asset.storageName}`,
})

export const createAssetService = (db: DB): AssetService => ({
  record(input) {
    const asset: Asset = {
      id: input.id ?? crypto.randomUUID(),
      filename: input.filename,
      storageName: input.storageName,
      mime: input.mime,
      size: input.size,
      authorId: input.authorId,
      createdAt: Date.now(),
    }
    db.insert(assets).values(asset).run()
    return toView(asset)
  },
  list() {
    return db.select().from(assets).orderBy(desc(assets.createdAt)).all().map(toView)
  },
  findById(id) {
    const asset = db.select().from(assets).where(eq(assets.id, id)).get()
    return asset ? toView(asset) : null
  },
  rename(id, filename) {
    const asset = db.select().from(assets).where(eq(assets.id, id)).get()
    const clean = filename.trim()
    if (!asset || !clean) return null
    db.update(assets).set({ filename: clean }).where(eq(assets.id, id)).run()
    return toView({ ...asset, filename: clean })
  },
  remove(id) {
    const asset = db.select().from(assets).where(eq(assets.id, id)).get()
    if (!asset) return null
    db.delete(assets).where(eq(assets.id, id)).run()
    return toView(asset)
  },
})
