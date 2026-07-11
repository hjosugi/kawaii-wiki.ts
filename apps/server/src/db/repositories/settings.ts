import type { DB } from '../client.ts'
import { siteSettings } from '../schema.ts'
import type { SettingsRepository } from '../../repositories/settings.ts'

export const createSqliteSettingsRepository = (db: DB): SettingsRepository => ({
  async list() {
    return db.select().from(siteSettings).all()
  },
  async upsertAll(records) {
    if (!records.length) return
    db.transaction((tx) => {
      for (const record of records) {
        tx.insert(siteSettings).values(record).onConflictDoUpdate({
          target: siteSettings.key,
          set: { value: record.value, updatedAt: record.updatedAt },
        }).run()
      }
    })
  },
})
