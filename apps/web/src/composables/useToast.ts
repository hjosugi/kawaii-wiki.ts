import { readonly, ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastMessage {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
  readonly duration: number
}

const messages = ref<ToastMessage[]>([])
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

const dismiss = (id: number): void => {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  messages.value = messages.value.filter((toast) => toast.id !== id)
}

const show = (message: string, tone: ToastTone = 'info', duration = 4_000): number => {
  const id = nextId++
  messages.value = [...messages.value, { id, message, tone, duration }]
  if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration))
  return id
}

export const useToast = () => ({
  messages: readonly(messages),
  show,
  success: (message: string, duration?: number) => show(message, 'success', duration),
  error: (message: string, duration = 7_000) => show(message, 'error', duration),
  dismiss,
})
