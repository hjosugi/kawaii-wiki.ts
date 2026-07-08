import { describe, expect, test } from 'bun:test'
import type { Principal } from '@ts-wiki/core'
import { createDb } from '../db/client.ts'
import { createSettingsService } from './settings.ts'

const admin: Principal = { id: 'admin-1', role: 'admin' }
const viewer: Principal = { id: 'viewer-1', role: 'viewer' }

describe('settings service', () => {
  test('rejects non-admin updates and invalid appearance values', () => {
    const settings = createSettingsService(createDb(':memory:'))

    expect(settings.update(viewer, { siteTitle: 'Nope' }).ok).toBe(false)

    const invalidColor = settings.update(admin, { accentColor: 'violet' })
    expect(invalidColor.ok).toBe(false)
    if (!invalidColor.ok) expect(invalidColor.error.field).toBe('accentColor')

    const invalidZone = settings.update(admin, { timezone: 'Not/A_Zone' })
    expect(invalidZone.ok).toBe(false)
    if (!invalidZone.ok) expect(invalidZone.error.field).toBe('timezone')
  })

  test('sanitizes nav settings and gates trusted head HTML', () => {
    const db = createDb(':memory:')
    const locked = createSettingsService(db, { allowHeadInjection: false })
    const updated = locked.update(admin, {
      siteTitle: 'Custom wiki',
      homePath: '../Docs/Home',
      customHeadHtml: '<script src="https://analytics.example/script.js"></script>',
      navLinks: [
        { label: 'Docs', url: '/docs', children: [{ label: 'Guide', url: '/docs/guide' }] },
        { label: 'Broken', url: 'javascript:alert(1)' },
      ],
      navItems: [
        { key: 'graph', visible: false },
        { key: 'changes', visible: true },
        { key: 'changes', visible: false },
      ],
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) throw new Error('settings update failed')
    expect(updated.value.homePath).toBe('docs/home')
    expect(updated.value.customHeadHtml).toBe('')
    expect(updated.value.navLinks).toEqual([
      { label: 'Docs', url: '/docs', icon: '', children: [{ label: 'Guide', url: '/docs/guide', icon: '', children: [] }] },
    ])
    expect(updated.value.navItems.filter((item) => item.key === 'changes')).toHaveLength(1)

    const trusted = createSettingsService(db, { allowHeadInjection: true })
    const withHead = trusted.update(admin, {
      customHeadHtml: '<script src="https://analytics.example/script.js"></script>',
    })
    expect(withHead.ok).toBe(true)
    if (withHead.ok) expect(withHead.value.customHeadHtml).toContain('analytics.example')
  })
})
