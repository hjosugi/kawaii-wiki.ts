<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Api, type AdminStats, type AnalyticsSummary, type SearchIndexStatus } from '@/lib/api'

const stats = ref<AdminStats | null>(null)
const analytics = ref<AnalyticsSummary | null>(null)
const searchIndex = ref<SearchIndexStatus | null>(null)
const loading = ref(false)
const rebuilding = ref(false)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [nextStats, nextAnalytics, nextSearchIndex] = await Promise.all([
      Api.adminStats(),
      Api.adminAnalytics(),
      Api.adminSearchIndex(),
    ])
    stats.value = nextStats
    analytics.value = nextAnalytics
    searchIndex.value = nextSearchIndex
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

async function rebuildAsTrigram(): Promise<void> {
  if (!confirm('Rebuild the search index with the trigram tokenizer? Back up the database first; searches may be incomplete while the rebuild is running.')) return
  rebuilding.value = true
  error.value = null
  try {
    searchIndex.value = await Api.adminRebuildSearchIndex('trigram')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    rebuilding.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-if="loading" class="text-gray-400">Loading...</p>
    <div v-if="stats" class="grid grid-cols-3 gap-4 max-w-xl">
      <div class="card p-4">
        <div class="text-3xl font-bold">{{ stats.users }}</div>
        <div class="text-sm text-gray-400 mt-1">Users</div>
      </div>
      <div class="card p-4">
        <div class="text-3xl font-bold">{{ stats.pages }}</div>
        <div class="text-sm text-gray-400 mt-1">Pages</div>
      </div>
      <div class="card p-4">
        <div class="text-3xl font-bold">{{ stats.revisions }}</div>
        <div class="text-sm text-gray-400 mt-1">Revisions</div>
      </div>
    </div>
    <div v-if="searchIndex" class="max-w-xl">
      <h2 class="text-lg font-semibold mb-3">Search index</h2>
      <div class="card p-4 space-y-3">
        <div class="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div class="text-gray-500">Current tokenizer</div>
            <div class="font-mono">{{ searchIndex.tokenizer }}</div>
          </div>
          <div>
            <div class="text-gray-500">Configured tokenizer</div>
            <div class="font-mono">{{ searchIndex.configuredTokenizer }}</div>
          </div>
          <div>
            <div class="text-gray-500">Pages with CJK content</div>
            <div>{{ searchIndex.cjkPages }} / {{ searchIndex.totalPages }} ({{ percent(searchIndex.cjkPageRatio) }})</div>
          </div>
          <div>
            <div class="text-gray-500">Indexed CJK characters</div>
            <div>{{ searchIndex.cjkCharacters }} / {{ searchIndex.indexedCharacters }} ({{ percent(searchIndex.cjkCharacterRatio) }})</div>
          </div>
        </div>
        <p v-if="searchIndex.needsTrigram" class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          CJK content is present while the index uses unicode61. Rebuild with trigram for better Japanese/CJK matching after taking a database backup.
        </p>
        <button class="btn-primary" type="button" :disabled="rebuilding" @click="rebuildAsTrigram">
          {{ rebuilding ? 'Rebuilding...' : 'Rebuild index as trigram' }}
        </button>
      </div>
    </div>
    <div v-if="analytics" class="max-w-xl">
      <h2 class="text-lg font-semibold mb-3">Insights</h2>
      <div class="card p-4">
        <div class="text-3xl font-bold">{{ analytics.totalViews }}</div>
        <div class="text-sm text-gray-400 mt-1">Total page views</div>
        <div v-if="analytics.topPages.length" class="mt-4 space-y-2">
          <RouterLink
            v-for="page in analytics.topPages"
            :key="page.path"
            :to="'/' + page.path"
            class="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span class="truncate font-mono text-sm">/{{ page.path }}</span>
            <span class="text-sm text-gray-500">{{ page.views }}</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
