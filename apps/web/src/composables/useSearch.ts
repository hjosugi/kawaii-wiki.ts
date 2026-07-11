import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { Api, type SearchHit, type SearchResponse, type SearchScope, type SearchShortQueryHint, type SearchSort, type SearchTokenizerHint } from '@/lib/api'
import { readMigratedStorage, writeStorage } from '@/lib/storage'
import { friendlyError } from '@/lib/friendlyErrors'

export interface SearchFilters {
  pathPrefix?: string
  label?: string
  status?: string
  spaceKey?: string
  locale?: string
  author?: string
  updatedAfter?: number
  updatedBefore?: number
}

export interface UseSearchOptions {
  limit?: number
  debounceMs?: number
  scope?: SearchScope
  sort?: SearchSort
}

const recentSearchesKey = 'kawaii-wiki.ts:recent-searches'
const maxRecentSearches = 10

export const readRecentSearches = (): string[] => {
  try {
    const parsed = JSON.parse(readMigratedStorage(recentSearchesKey, ['ts-wiki-recent-searches']) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, maxRecentSearches) : []
  } catch {
    return []
  }
}

const writeRecentSearches = (items: readonly string[]): void => {
  writeStorage(recentSearchesKey, JSON.stringify(items.slice(0, maxRecentSearches)))
}

export const rememberSearch = (query: string): string[] => {
  const clean = query.trim()
  if (!clean) return readRecentSearches()
  const next = [clean, ...readRecentSearches().filter((item) => item.toLowerCase() !== clean.toLowerCase())]
  writeRecentSearches(next)
  return next.slice(0, maxRecentSearches)
}

export const forgetSearch = (query: string): string[] => {
  const next = readRecentSearches().filter((item) => item !== query)
  writeRecentSearches(next)
  return next
}

export const useSearch = (options: UseSearchOptions = {}) => {
  const q = ref('')
  const hits = ref<SearchHit[]>([])
  const total = ref(0)
  const limit = ref(options.limit ?? 20)
  const offset = ref(0)
  const scope = ref<SearchScope>(options.scope ?? 'all')
  const sort = ref<SearchSort>(options.sort ?? 'relevance')
  const filters = ref<SearchFilters>({})
  const tokenizerHint = ref<SearchTokenizerHint | null>(null)
  const shortQueryHint = ref<SearchShortQueryHint | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const recentSearches = ref<string[]>(readRecentSearches())
  let timer: ReturnType<typeof setTimeout> | null = null

  const hasMore = computed(() => hits.value.length < total.value)

  function clear(): void {
    hits.value = []
    total.value = 0
    offset.value = 0
    tokenizerHint.value = null
    shortQueryHint.value = null
    error.value = null
  }

  async function run(opts: { append?: boolean } = {}): Promise<SearchResponse | null> {
    const query = q.value.trim()
    if (!query) {
      clear()
      return null
    }
    if (!opts.append) offset.value = 0
    loading.value = true
    error.value = null
    try {
      const result = await Api.search(query, {
        limit: limit.value,
        offset: opts.append ? offset.value : 0,
        scope: scope.value,
        sort: sort.value,
        filters: filters.value,
      })
      hits.value = opts.append ? [...hits.value, ...result.hits] : result.hits
      total.value = result.total
      offset.value = hits.value.length
      tokenizerHint.value = result.tokenizerHint ?? null
      shortQueryHint.value = result.shortQueryHint ?? null
      recentSearches.value = rememberSearch(query)
      return result
    } catch (e) {
      if (!opts.append) hits.value = []
      total.value = 0
      error.value = friendlyError(e)
      return null
    } finally {
      loading.value = false
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void run()
    }, options.debounceMs ?? 180)
  }

  function loadMore(): Promise<SearchResponse | null> {
    return run({ append: true })
  }

  function removeRecent(query: string): void {
    recentSearches.value = forgetSearch(query)
  }

  return {
    q,
    hits,
    total,
    limit,
    offset,
    scope,
    sort,
    filters,
    tokenizerHint,
    shortQueryHint,
    loading,
    error,
    hasMore,
    recentSearches,
    run,
    schedule,
    loadMore,
    clear,
    removeRecent,
  }
}

export const useListNavigation = (
  length: Ref<number> | ComputedRef<number>,
  runSelected: () => void,
) => {
  const selected = ref(0)
  const activeId = (prefix: string): string | undefined => length.value > 0 ? `${prefix}-${selected.value}` : undefined
  const reset = (): void => {
    selected.value = 0
  }
  const onKeydown = (event: KeyboardEvent): boolean => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selected.value = Math.min(selected.value + 1, Math.max(length.value - 1, 0))
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selected.value = Math.max(selected.value - 1, 0)
      return true
    }
    if (event.key === 'Enter' && length.value > 0) {
      event.preventDefault()
      runSelected()
      return true
    }
    return false
  }
  return { selected, activeId, reset, onKeydown }
}
