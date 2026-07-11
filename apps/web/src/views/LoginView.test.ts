import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import LoginView from './LoginView.vue'
import { ApiClientError } from '@/lib/api'

const api = vi.hoisted(() => ({
  login: vi.fn(),
  authProviders: vi.fn(),
  publicSettings: vi.fn(),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, Api: { ...actual.Api, ...api } }
})

describe('LoginView', () => {
  beforeEach(() => {
    api.login.mockReset()
    api.authProviders.mockResolvedValue([])
    api.publicSettings.mockResolvedValue({ registration: 'off', mailConfigured: false })
  })

  test('asks for a 2FA code only after the password is accepted', async () => {
    api.login.mockRejectedValue(new ApiClientError(
      'Sign-in failed.',
      'unauthorized',
      401,
      'Two-factor code required or invalid',
    ))
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/_login', name: 'login', component: LoginView }],
    })
    await router.push('/_login')
    await router.isReady()
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.find('[aria-label="6-digit authentication code or backup code"]').exists()).toBe(false)
    await wrapper.find('[aria-label="Email"]').setValue('owner@example.com')
    await wrapper.find('[aria-label="Password"]').setValue('password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[aria-label="Email"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Password"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="6-digit authentication code or backup code"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('authentication app')
  })
})
