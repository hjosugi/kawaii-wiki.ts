export interface SettingRecord {
  readonly key: string
  readonly value: string
  readonly updatedAt: number
}

export interface SettingsRepository {
  list(): Promise<SettingRecord[]>
  upsertAll(records: readonly SettingRecord[]): Promise<void>
}
