import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Api, ApiClientError, setToken } from './api'

const eden = vi.hoisted(() => {
  let root: Record<string, unknown> = {}
  return {
    treaty: vi.fn(() => root),
    setRoot: (next: Record<string, unknown>) => {
      root = next
    },
  }
})

vi.mock('@elysiajs/eden', () => ({
  treaty: eden.treaty,
}))

const ok = <T>(data: T) => Promise.resolve({ data, error: null })

describe('Api client', () => {
  beforeEach(() => {
    setToken(null)
    eden.treaty.mockClear()
  })

  test('attaches the current bearer token to each fresh treaty client', async () => {
    const health = vi.fn(() => ok({ ok: true, name: 'ts-wiki', version: '0.0.0' }))
    eden.setRoot({ api: { health: { get: health } } })

    setToken('jwt-token')
    await Api.health()

    expect(eden.treaty).toHaveBeenCalledWith(expect.any(String), {
      headers: { authorization: 'Bearer jwt-token' },
    })
    expect(health).toHaveBeenCalled()
  })

  test('keeps page delete query options in the second Eden argument', async () => {
    const deletePage = vi.fn(() => ok({ path: 'docs/a' }))
    eden.setRoot({ api: { page: { delete: deletePage } } })

    await Api.deletePage('docs/a')

    expect(deletePage).toHaveBeenCalledWith(null, { query: { path: 'docs/a' } })
  })

  test('builds representative query and body shapes', async () => {
    const popular = vi.fn(() => ok({ pages: [] }))
    const audit = vi.fn(() => ok({ events: [], total: 0, limit: 25, offset: 0 }))
    const recoveryCodes = vi.fn(() => ok({ recoveryCodes: ['ABCD-EFGH-JKLM'] }))
    eden.setRoot({
      api: {
        pages: { popular: { get: popular } },
        admin: { audit: { get: audit } },
        auth: { totp: { 'recovery-codes': { post: recoveryCodes } } },
      },
    })

    await Api.popularPages(7, 3)
    await Api.adminAudit({ action: 'page.', userId: 'u1', from: 10, to: 20, limit: 25 })
    await Api.totpRecoveryCodes('123456')

    expect(popular).toHaveBeenCalledWith({ query: { days: 7, limit: 3 } })
    expect(audit).toHaveBeenCalledWith({
      query: { action: 'page.', userId: 'u1', from: 10, to: 20, limit: 25 },
    })
    expect(recoveryCodes).toHaveBeenCalledWith({ code: '123456' })
  })

  test('maps Eden error envelopes to ApiClientError', async () => {
    const deletePage = vi.fn(() => Promise.resolve({
      data: null,
      error: {
        status: 409,
        value: { error: { kind: 'conflict', message: 'Page changed', field: 'path' } },
      },
    }))
    eden.setRoot({ api: { page: { delete: deletePage } } })

    await expect(Api.deletePage('docs/a')).rejects.toMatchObject({
      name: 'ApiClientError',
      kind: 'conflict',
      status: 409,
      rawMessage: 'Page changed',
      field: 'path',
    } satisfies Partial<ApiClientError>)
  })
})
