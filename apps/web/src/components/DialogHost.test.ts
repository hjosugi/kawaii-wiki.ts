import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import DialogHost from './DialogHost.vue'
import { useDialogs } from '@/composables/useDialogs'

describe('DialogHost', () => {
  test('always renders visible cancel and confirm actions', async () => {
    const wrapper = mount(DialogHost, { attachTo: document.body })
    const result = useDialogs().confirm({ message: 'Archive this page?' })
    await flushPromises()

    const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Cancel', 'Confirm'])
    expect(buttons[1]?.classList.contains('btn-primary')).toBe(true)

    buttons[1]?.click()
    await expect(result).resolves.toBe(true)
    wrapper.unmount()
  })
})
