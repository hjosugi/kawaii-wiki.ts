import { eq } from 'drizzle-orm'
import type { DB } from '../client.ts'
import { linkPreviews } from '../schema.ts'
import type { LinkPreviewRepository } from '../../repositories/link-previews.ts'

export const createSqliteLinkPreviewRepository = (db: DB): LinkPreviewRepository => ({
  async findByUrl(url) {
    return db.select().from(linkPreviews).where(eq(linkPreviews.url, url)).get()
  },

  async upsert(preview) {
    db.insert(linkPreviews)
      .values(preview)
      .onConflictDoUpdate({
        target: linkPreviews.url,
        set: {
          kind: preview.kind,
          provider: preview.provider,
          title: preview.title,
          description: preview.description,
          image: preview.image,
          author: preview.author,
          siteName: preview.siteName,
          contentType: preview.contentType,
          data: preview.data,
          fetchedAt: preview.fetchedAt,
          expiresAt: preview.expiresAt,
        },
      })
      .run()
  },
})
