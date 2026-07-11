import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { assets, pageAssetRefs, pages } from '../schema.ts'
import type { AssetRepository } from '../../repositories/assets.ts'

export const createSqliteAssetRepository = (db: DB): AssetRepository => ({
  async listActive(folder) {
    const where = folder === undefined
      ? isNull(assets.deletedAt)
      : and(isNull(assets.deletedAt), eq(assets.folder, folder))
    return db.select().from(assets).where(where).orderBy(desc(assets.createdAt)).all()
  },
  async listDeleted() {
    return db.select().from(assets).where(isNotNull(assets.deletedAt)).orderBy(desc(assets.deletedAt)).all()
  },
  async findActive(id) {
    return db.select().from(assets).where(and(eq(assets.id, id), isNull(assets.deletedAt))).get()
  },
  async findDeleted(id) {
    return db.select().from(assets).where(and(eq(assets.id, id), isNotNull(assets.deletedAt))).get()
  },
  async listActivePages() {
    return db.select({ id: pages.id, path: pages.path, title: pages.title, content: pages.content })
      .from(pages).where(eq(pages.lifecycle, 'active')).orderBy(asc(pages.path)).all()
  },
  async listReferences(pageIds) {
    return pageIds.length
      ? db.select().from(pageAssetRefs).where(inArray(pageAssetRefs.pageId, [...pageIds])).all()
      : []
  },
  async insertReferences(pageIds, assetId) {
    if (!pageIds.length) return
    db.insert(pageAssetRefs).values(pageIds.map((pageId) => ({ pageId, assetId }))).onConflictDoNothing().run()
  },
  async listAffectedPageIds(assetId) {
    return db.select({ id: pageAssetRefs.pageId }).from(pageAssetRefs)
      .where(eq(pageAssetRefs.assetId, assetId)).all().map((row) => row.id)
  },
  async listAccessPaths(storageName) {
    return db.select({ path: pages.path }).from(assets)
      .innerJoin(pageAssetRefs, eq(pageAssetRefs.assetId, assets.id))
      .innerJoin(pages, eq(pages.id, pageAssetRefs.pageId))
      .where(and(eq(assets.storageName, storageName), eq(pages.lifecycle, 'active')))
      .all().map((row) => row.path)
  },
  async insert(record) {
    db.insert(assets).values(record).run()
  },
  async update(id, changes) {
    db.update(assets).set(changes).where(eq(assets.id, id)).run()
  },
  async delete(id) {
    db.delete(assets).where(eq(assets.id, id)).run()
  },
})
