import { onMounted, shallowRef, type ShallowRef } from 'vue'
import { useToast } from '@/composables/useToast'

export interface AsyncDataOptions<T> {
  readonly initial?: T
  readonly immediate?: boolean
  readonly toastErrors?: boolean
}

export interface AsyncDataResult<T> {
  data: ShallowRef<T | undefined>
  loading: ShallowRef<boolean>
  error: ShallowRef<string | null>
  reload: () => Promise<T | undefined>
}

export interface InitializedAsyncDataResult<T> extends Omit<AsyncDataResult<T>, 'data'> {
  data: ShallowRef<T>
}

export function useAsyncData<T>(fetcher: () => Promise<T>, options: AsyncDataOptions<T> & { initial: T }): InitializedAsyncDataResult<T>
export function useAsyncData<T>(fetcher: () => Promise<T>, options?: AsyncDataOptions<T>): AsyncDataResult<T>
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  options: AsyncDataOptions<T> = {},
): AsyncDataResult<T> {
  const data = shallowRef<T | undefined>(options.initial)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const toast = useToast()
  let generation = 0

  const reload = async (): Promise<T | undefined> => {
    const current = ++generation
    loading.value = true
    error.value = null
    try {
      const next = await fetcher()
      if (current === generation) data.value = next
      return next
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (current === generation) error.value = message
      if (options.toastErrors !== false) toast.error(message)
      return undefined
    } finally {
      if (current === generation) loading.value = false
    }
  }

  if (options.immediate !== false) onMounted(() => void reload())
  return { data, loading, error, reload }
}
