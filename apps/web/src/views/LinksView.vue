<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Api, type BrokenLink } from '@/lib/api'

const links = ref<BrokenLink[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Group broken targets by the missing page so the same dead link isn't repeated.
const byTarget = computed(() => {
  const map = new Map<string, BrokenLink[]>()
  for (const link of links.value) {
    const list = map.get(link.target) ?? []
    list.push(link)
    map.set(link.target, list)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    links.value = await Api.brokenLinks()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Broken links</h1>
        <p class="mt-1 text-sm text-gray-500">Links pointing at pages that don't exist yet</p>
      </div>
      <button class="btn-ghost" type="button" :disabled="loading" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <div v-if="loading" class="text-gray-400">Loading...</div>

    <div v-if="byTarget.length" class="space-y-4">
      <div v-for="[target, sources] in byTarget" :key="target" class="card p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0 font-mono text-sm">
            <span class="text-red-600">/{{ target }}</span>
            <span class="ml-2 text-xs text-gray-400">{{ sources.length }} link{{ sources.length === 1 ? '' : 's' }}</span>
          </div>
          <RouterLink class="btn-ghost" :to="'/' + target">Create page</RouterLink>
        </div>
        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
          <span class="text-xs uppercase tracking-wide text-gray-400">Linked from</span>
          <RouterLink v-for="source in sources" :key="source.path" class="link-quiet" :to="'/' + source.path">
            {{ source.title || source.path }}
          </RouterLink>
        </div>
      </div>
    </div>

    <p v-if="!loading && !links.length" class="text-gray-500">No broken links. 🎉</p>
  </div>
</template>
