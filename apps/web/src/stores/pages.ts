import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Api, type PageSummary } from '@/lib/api'

/** Holds the page list shown in the sidebar; refreshed after edits/deletes. */
export const usePages = defineStore('pages', () => {
  const list = ref<PageSummary[]>([])

  async function refresh(): Promise<void> {
    try {
      list.value = await Api.listPages()
    } catch {
      list.value = []
    }
  }

  return { list, refresh }
})
