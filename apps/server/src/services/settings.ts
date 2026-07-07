import {
  type AppError,
  type Principal,
  type Result,
  err,
  ok,
  requirePermission,
  validationError,
} from '@ts-wiki/core'
import type { DB } from '../db/client.ts'
import { siteSettings } from '../db/schema.ts'

export interface NavLink {
  readonly label: string
  readonly url: string
}

export interface PublicSettings {
  readonly siteTitle: string
  readonly accentColor: string
  readonly theme: 'system' | 'light' | 'dark'
  readonly navLinks: NavLink[]
}

export interface SettingsPatch {
  readonly siteTitle?: string
  readonly accentColor?: string
  readonly theme?: 'system' | 'light' | 'dark'
  readonly navLinks?: readonly NavLink[]
}

export interface SettingsService {
  public(): PublicSettings
  update(principal: Principal | null, patch: SettingsPatch): Result<PublicSettings, AppError>
}

const DEFAULT_SETTINGS: PublicSettings = {
  siteTitle: 'ts-wiki',
  accentColor: '#7c3aed',
  theme: 'system',
  navLinks: [],
}

const SETTING_KEYS = ['siteTitle', 'accentColor', 'theme', 'navLinks'] as const
type SettingKey = (typeof SETTING_KEYS)[number]

const isSettingKey = (value: string): value is SettingKey => SETTING_KEYS.includes(value as SettingKey)

const cleanNavLinks = (links: readonly NavLink[] = []): NavLink[] =>
  links
    .map((link) => ({
      label: link.label.trim().slice(0, 60),
      url: link.url.trim().slice(0, 500),
    }))
    .filter((link) => link.label && (/^https?:\/\//i.test(link.url) || link.url.startsWith('/')))
    .slice(0, 12)

const parseStoredValue = (key: SettingKey, value: string): unknown => {
  if (key === 'navLinks') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? cleanNavLinks(parsed as NavLink[]) : []
    } catch {
      return []
    }
  }
  return value
}

const validatePatch = (current: PublicSettings, patch: SettingsPatch): Result<PublicSettings, AppError> => {
  const siteTitle = patch.siteTitle === undefined ? current.siteTitle : patch.siteTitle.trim().slice(0, 80)
  if (!siteTitle) return err(validationError('Site title is required', 'siteTitle'))

  const accentColor = patch.accentColor ?? current.accentColor
  if (!/^#[0-9a-f]{6}$/i.test(accentColor)) {
    return err(validationError('Accent color must be a hex color like #7c3aed', 'accentColor'))
  }

  const theme = patch.theme ?? current.theme
  if (theme !== 'system' && theme !== 'light' && theme !== 'dark') {
    return err(validationError('Unknown theme', 'theme'))
  }

  return ok({
    siteTitle,
    accentColor,
    theme,
    navLinks: patch.navLinks === undefined ? current.navLinks : cleanNavLinks(patch.navLinks),
  })
}

export const createSettingsService = (db: DB): SettingsService => {
  const read = (): PublicSettings => {
    const next: Record<SettingKey, unknown> = { ...DEFAULT_SETTINGS }
    for (const row of db.select().from(siteSettings).all()) {
      if (isSettingKey(row.key)) next[row.key] = parseStoredValue(row.key, row.value)
    }
    return next as unknown as PublicSettings
  }

  const write = (settings: PublicSettings): void => {
    const now = Date.now()
    const rows: Array<{ key: SettingKey; value: string; updatedAt: number }> = [
      { key: 'siteTitle', value: settings.siteTitle, updatedAt: now },
      { key: 'accentColor', value: settings.accentColor, updatedAt: now },
      { key: 'theme', value: settings.theme, updatedAt: now },
      { key: 'navLinks', value: JSON.stringify(settings.navLinks), updatedAt: now },
    ]
    const stmt = db.$client.prepare(`
      INSERT INTO site_settings(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    for (const row of rows) stmt.run(row.key, row.value, row.updatedAt)
  }

  return {
    public: read,
    update(principal, patch) {
      const allowed = requirePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed
      const next = validatePatch(read(), patch)
      if (!next.ok) return next
      write(next.value)
      return next
    },
  }
}
