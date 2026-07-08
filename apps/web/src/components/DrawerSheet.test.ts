import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, test } from 'vitest'
import DrawerSheet from './DrawerSheet.vue'

describe('DrawerSheet', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  test('renders an aria-modal dialog and closes on Escape', async () => {
    const wrapper = mount(DrawerSheet, {
      attachTo: document.body,
      props: { open: true, title: 'Pages' },
      slots: { default: '<button type="button">Inside</button>' },
    })

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.textContent).toContain('Pages')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  test('restores focus and body scrolling after close', async () => {
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    const wrapper = mount(DrawerSheet, {
      attachTo: document.body,
      props: { open: true, title: 'Pages' },
      slots: { default: '<button type="button">Inside</button>' },
    })
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.setProps({ open: false })
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)
  })
})
