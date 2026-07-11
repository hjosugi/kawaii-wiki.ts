import { computed, type ComputedRef, type ShallowRef } from 'vue'
import { useAsyncData } from '@/composables/useAsyncData'

export const useCrudResource = <T>(fetcher: () => Promise<T[]>): {
  items: ComputedRef<T[]>
  loading: ShallowRef<boolean>
  error: ShallowRef<string | null>
  reload: () => Promise<T[] | undefined>
} => {
  const state = useAsyncData(fetcher, { initial: [] as T[] })
  return {
    items: computed(() => state.data.value ?? []),
    loading: state.loading,
    error: state.error,
    reload: state.reload,
  }
}
