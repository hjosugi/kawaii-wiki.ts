import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { PageSummary, PublicUser } from '@/lib/api'
import { getToken, setToken } from '@/lib/api'
import { useAuth } from './auth'
import { usePages } from './pages'

const api = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  me: vi.fn(),
  listPages: vi.fn(),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, Api: { ...actual.Api, ...api } }
})

const user = (role: PublicUser['role'] = 'editor'): PublicUser => ({
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  role,
  totpEnabled: false,
  profileBio: '',
  profileCoverUrl: '',
  profileLinks: [],
  profileFavoritePages: [],
})

const page = (path: string): PageSummary => ({
  path,
  title: path,
  description: '',
  icon: '',
  coverUrl: '',
  coverPosition: 'center',
  lifecycle: 'active',
  status: 'draft',
  labels: '[]',
  ownerId: null,
  authorId: null,
  reviewAt: null,
  navOrder: null,
  pinned: false,
  spaceKey: 'main',
  locale: 'und',
  updatedAt: 1,
})

describe('stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setToken(null)
    api.login.mockReset()
    api.register.mockReset()
    api.me.mockReset()
    api.listPages.mockReset()
  })

  test('auth login persists the token and exposes role-derived state', async () => {
    api.login.mockResolvedValue({ token: 'jwt-1', user: user('admin') })
    const auth = useAuth()

    await expect(auth.login('ada@example.com', 'password', '123456')).resolves.toBe('signed-in')

    expect(api.login).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'password',
      totpCode: '123456',
    })
    expect(getToken()).toBe('jwt-1')
    expect(auth.user?.email).toBe('ada@example.com')
    expect(auth.isAuthed).toBe(true)
    expect(auth.canEdit).toBe(true)
    expect(auth.isAdmin).toBe(true)
  })

  test('auth handles setup-required and verification-required responses without leaving a token', async () => {
    setToken('old-token')
    api.login.mockResolvedValue({
      twoFactorSetupRequired: true,
      setupToken: 'setup-token',
      user: user('viewer'),
    })
    const auth = useAuth()

    await expect(auth.login('ada@example.com', 'password')).resolves.toEqual({
      status: 'two-factor-setup-required',
      setupToken: 'setup-token',
    })
    expect(getToken()).toBeNull()
    expect(auth.user).toBeNull()

    api.register.mockResolvedValue({ verificationRequired: true })
    await expect(auth.register('ada@example.com', 'Ada', 'password')).resolves.toBe('verification-required')
    expect(getToken()).toBeNull()
  })

  test('fetchMe clears invalid tokens and logout clears local auth state', async () => {
    setToken('expired-token')
    api.me.mockRejectedValue(new Error('expired'))
    const auth = useAuth()

    await auth.fetchMe()

    expect(api.me).toHaveBeenCalled()
    expect(auth.ready).toBe(true)
    expect(auth.user).toBeNull()
    expect(getToken()).toBeNull()

    api.login.mockResolvedValue({ token: 'jwt-2', user: user('editor') })
    await auth.login('ada@example.com', 'password')
    auth.logout()
    expect(auth.user).toBeNull()
    expect(getToken()).toBeNull()
  })

  test('pages refresh stores page lists and clears stale data on failure', async () => {
    api.listPages.mockResolvedValue([page('docs/a'), page('docs/b')])
    const pages = usePages()

    await pages.refresh()
    expect(pages.list.map((item) => item.path)).toEqual(['docs/a', 'docs/b'])

    api.listPages.mockRejectedValue(new Error('network'))
    await pages.refresh()
    expect(pages.list).toEqual([])
  })
})
