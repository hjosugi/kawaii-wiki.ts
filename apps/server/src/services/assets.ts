/**
 * Asset service — records uploaded-file metadata. The bytes live behind the
 * configured asset storage boundary; this just tracks them.
 */
import { asc, eq, desc } from 'drizzle-orm'
import { fileTypeFromBlob } from 'file-type'
import { type AppError, type Principal, type Result, can, err, forbidden, normalizePath, ok, validationError } from '@ts-wiki/core'
import type { DB } from '../db/client.ts'
import { assets, pages, type Asset } from '../db/schema.ts'

export const ASSET_MAX_SIZE = '25m' as const
export const ASSET_MAX_BYTES = 25 * 1024 * 1024
export const ASSET_HARD_MAX_SIZE = '100m' as const
export const ALLOWED_ASSET_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
] as const

export type AllowedAssetMime = (typeof ALLOWED_ASSET_MIME_TYPES)[number]

const ASSET_EXTENSIONS: Record<AllowedAssetMime, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.oasis.opendocument.presentation': '.odp',
}

const normalizeAssetMime = (mime: string): string => mime.split(';', 1)[0]!.trim().toLowerCase()

const isAllowedAssetMime = (mime: string): mime is AllowedAssetMime =>
  ALLOWED_ASSET_MIME_TYPES.includes(mime as AllowedAssetMime)

export const assetExtensionForMime = (mime: string): string | null => {
  const normalized = normalizeAssetMime(mime)
  return isAllowedAssetMime(normalized) ? ASSET_EXTENSIONS[normalized] : null
}

const TEXT_ASSET_MIME_TYPES = new Set<AllowedAssetMime>([
  'text/plain',
  'text/markdown',
  'text/csv',
])

const ZIP_ASSET_MIME_TYPES = new Set<AllowedAssetMime>([
  'application/zip',
  'application/x-zip-compressed',
])

const fileBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer())

const decodeUtf8 = (bytes: Uint8Array): string | null => {
  if (bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

const validateTextAsset = async (file: File, mime: AllowedAssetMime): Promise<boolean> => {
  const text = decodeUtf8(await fileBytes(file))
  if (text === null) return false
  if (mime !== 'application/json') return true
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

const assetMimeMatches = (declared: AllowedAssetMime, detected: string): boolean =>
  declared === detected ||
  (ZIP_ASSET_MIME_TYPES.has(declared) && detected === 'application/zip')

export const validateAssetUpload = async (file: File): Promise<Result<AllowedAssetMime, AppError>> => {
  const declared = normalizeAssetMime(file.type)
  if (!isAllowedAssetMime(declared)) {
    return err(validationError('Unsupported asset type', 'file'))
  }

  if (TEXT_ASSET_MIME_TYPES.has(declared) || declared === 'application/json') {
    return (await validateTextAsset(file, declared))
      ? ok(declared)
      : err(validationError('Asset contents do not match the declared type', 'file'))
  }

  const detected = await fileTypeFromBlob(file).catch(() => undefined)
  if (!detected || !assetMimeMatches(declared, detected.mime)) {
    return err(validationError('Asset contents do not match the declared type', 'file'))
  }

  return ok(declared)
}

export const safeAssetFilename = (file: File, mime: string = file.type): string => {
  const stem =
    file.name
      .replace(/\.[^.]*$/, '')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'upload'
  const extension = assetExtensionForMime(mime) ?? '.bin'
  return `${stem}${extension}`
}

export const safeAssetStorageName = (
  file: File,
  id: string = crypto.randomUUID(),
  mime: string = file.type,
): string =>
  `${id}-${safeAssetFilename(file, mime)}`

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

export interface AssetUsagePage {
  readonly path: string
  readonly title: string
}

export interface AssetUsageView {
  readonly asset: AssetView
  readonly pages: AssetUsagePage[]
}

export interface AssetService {
  record(input: RecordAssetInput, principal: Principal | null): Result<AssetView, AppError>
  list(principal: Principal | null): Result<AssetView[], AppError>
  usage(principal: Principal | null, path?: string): Result<AssetUsageView[], AppError>
  orphans(principal: Principal | null): Result<AssetView[], AppError>
  findById(id: string, principal: Principal | null): Result<AssetView | null, AppError>
  rename(id: string, filename: string, principal: Principal | null): Result<AssetView | null, AppError>
  remove(id: string, principal: Principal | null): Result<AssetView | null, AppError>
}

export interface AssetServiceOptions {
  readonly urlForStorageName?: (storageName: string) => string
}

const encodeAssetPath = (storageName: string): string =>
  storageName.split('/').map(encodeURIComponent).join('/')

const defaultAssetUrl = (storageName: string): string => `/assets/${encodeAssetPath(storageName)}`

const toView = (asset: Asset, urlForStorageName: (storageName: string) => string): AssetView => ({
  ...asset,
  url: urlForStorageName(asset.storageName),
})

const assetReferenceAliases = (asset: AssetView): string[] => {
  const aliases = new Set<string>([
    asset.url,
    defaultAssetUrl(asset.storageName),
    `/assets/${asset.storageName}`,
  ])
  for (const value of [...aliases]) {
    try {
      aliases.add(decodeURI(value))
    } catch {
      /* keep the encoded value only */
    }
  }
  return [...aliases].filter(Boolean)
}

const contentReferencesAsset = (content: string, asset: AssetView): boolean =>
  assetReferenceAliases(asset).some((alias) => content.includes(alias))

export const createAssetService = (db: DB, options: AssetServiceOptions = {}): AssetService => {
  const urlForStorageName = options.urlForStorageName ?? defaultAssetUrl
  const listRecords = (): Asset[] => db.select().from(assets).orderBy(desc(assets.createdAt)).all()
  const usageFor = (principal: Principal | null, path?: string): AssetUsageView[] => {
    const targetPath = path ? normalizePath(path) : null
    const visiblePages = db
      .select({
        path: pages.path,
        title: pages.title,
        content: pages.content,
      })
      .from(pages)
      .where(eq(pages.lifecycle, 'active'))
      .orderBy(asc(pages.path))
      .all()
      .filter((page) => (!targetPath || page.path === targetPath) && can(principal, 'page:read', { path: page.path }))

    return listRecords().map((asset) => {
      const view = toView(asset, urlForStorageName)
      return {
        asset: view,
        pages: visiblePages
          .filter((page) => contentReferencesAsset(page.content, view))
          .map(({ path, title }) => ({ path, title })),
      }
    })
  }

  return {
    record(input, principal) {
      if (!can(principal, 'asset:write')) return err(forbidden())
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
      return ok(toView(asset, urlForStorageName))
    },
    list(principal) {
      if (!can(principal, 'asset:read')) return err(forbidden())
      return ok(listRecords().map((asset) => toView(asset, urlForStorageName)))
    },
    usage(principal, path) {
      if (!can(principal, 'asset:read')) return err(forbidden())
      const targetPath = path ? normalizePath(path) : null
      if (targetPath && !can(principal, 'page:read', { path: targetPath })) return err(forbidden())

      return ok(usageFor(principal, path))
    },
    orphans(principal) {
      if (!can(principal, 'asset:read')) return err(forbidden())
      return ok(usageFor(principal).filter((entry) => entry.pages.length === 0).map((entry) => entry.asset))
    },
    findById(id, principal) {
      if (!can(principal, 'asset:read')) return err(forbidden())
      const asset = db.select().from(assets).where(eq(assets.id, id)).get()
      return ok(asset ? toView(asset, urlForStorageName) : null)
    },
    rename(id, filename, principal) {
      if (!can(principal, 'asset:write')) return err(forbidden())
      const asset = db.select().from(assets).where(eq(assets.id, id)).get()
      const clean = filename.trim()
      if (!asset || !clean) return ok(null)
      db.update(assets).set({ filename: clean }).where(eq(assets.id, id)).run()
      return ok(toView({ ...asset, filename: clean }, urlForStorageName))
    },
    remove(id, principal) {
      if (!can(principal, 'asset:delete')) return err(forbidden())
      const asset = db.select().from(assets).where(eq(assets.id, id)).get()
      if (!asset) return ok(null)
      db.delete(assets).where(eq(assets.id, id)).run()
      return ok(toView(asset, urlForStorageName))
    },
  }
}
