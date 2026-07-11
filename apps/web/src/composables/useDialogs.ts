import { readonly, ref } from 'vue'

export interface ConfirmDialogOptions {
  readonly title?: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
}

export interface PromptDialogOptions extends ConfirmDialogOptions {
  readonly defaultValue?: string
  readonly inputLabel?: string
  readonly required?: boolean
}

type DialogRequest =
  | ({ readonly kind: 'confirm'; readonly resolve: (value: boolean) => void } & ConfirmDialogOptions)
  | ({ readonly kind: 'prompt'; readonly resolve: (value: string | null) => void } & PromptDialogOptions)

const active = ref<DialogRequest | null>(null)
const queue: DialogRequest[] = []

const advance = (): void => {
  active.value = queue.shift() ?? null
}

const enqueue = (request: DialogRequest): void => {
  queue.push(request)
  if (!active.value) advance()
}

const confirmDialog = (options: ConfirmDialogOptions | string): Promise<boolean> =>
  new Promise((resolve) => enqueue({
    kind: 'confirm',
    ...(typeof options === 'string' ? { message: options } : options),
    resolve,
  }))

const promptDialog = (options: PromptDialogOptions | string): Promise<string | null> =>
  new Promise((resolve) => enqueue({
    kind: 'prompt',
    ...(typeof options === 'string' ? { message: options } : options),
    resolve,
  }))

const settle = (value: boolean | string | null): void => {
  const request = active.value
  if (!request) return
  if (request.kind === 'confirm') request.resolve(Boolean(value))
  else request.resolve(typeof value === 'string' ? value : null)
  active.value = null
  advance()
}

export const useDialogs = () => ({
  active: readonly(active),
  confirm: confirmDialog,
  prompt: promptDialog,
  settle,
})
