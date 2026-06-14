<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Api, type SearchHit } from '@/lib/api'

const route = useRoute()
const router = useRouter()

const q = ref((route.query.q as string) ?? '')
const hits = ref<SearchHit[]>([])
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function run(): Promise<void> {
  if (!q.value.trim()) {
    hits.value = []
    return
  }
  loading.value = true
  try {
    hits.value = (await Api.search(q.value)).hits
  } finally {
    loading.value = false
  }
}

function onInput(): void {
  router.replace({ query: { q: q.value } })
  if (timer) clearTimeout(timer)
  timer = setTimeout(run, 180)
}

watch(
  () => route.query.q,
  (value) => {
    const next = (value as string) ?? ''
    if (next !== q.value) {
      q.value = next
      run()
    }
  },
)

run()
</script>

<template>
  <div class="max-w-2xl">
    <input
      v-model="q"
      class="input text-lg mb-6"
      placeholder="Search the wiki…"
      @input="onInput"
    />

    <p v-if="loading" class="text-gray-400">Searching…</p>
    <p v-else-if="q && !hits.length" class="text-gray-400">No results for “{{ q }}”.</p>

    <ul class="space-y-3">
      <li
        v-for="h in hits"
        :key="h.path"
        class="card p-4 hover:border-violet-400 transition"
      >
        <RouterLink :to="'/' + h.path" class="block">
          <div class="font-semibold text-violet-600">{{ h.title }}</div>
          <div class="text-xs text-gray-400 mb-1 font-mono">/{{ h.path }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-300 search-snippet" v-html="h.snippet"></div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style>
.search-snippet mark {
  background: rgba(139, 92, 246, 0.25);
  color: inherit;
  border-radius: 2px;
  padding: 0 2px;
}
</style>
