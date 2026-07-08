<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Api, type AdminHistoryStats, type PurgeHistoryResult } from '@/lib/api'

const stats = ref<AdminHistoryStats | null>(null)
const lastPurge = ref<PurgeHistoryResult | null>(null)
const olderThanDays = ref(90)
const keepLatest = ref(5)
const loading = ref(false)
const purging = ref(false)
const error = ref<string | null>(null)

const formatBytes = (value: number): string =>
  value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(value / 1024))} KB`

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    stats.value = await Api.adminHistoryStats()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function purge(): Promise<void> {
  if (!confirm(`Purge revisions older than ${olderThanDays.value} days while keeping ${keepLatest.value} per page?`)) return
  purging.value = true
  error.value = null
  try {
    lastPurge.value = await Api.adminPurgeHistory({
      olderThanDays: olderThanDays.value,
      keepLatest: keepLatest.value,
    })
    stats.value = {
      revisions: lastPurge.value.revisions,
      historyBytes: lastPurge.value.historyBytes,
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    purging.value = false
  }
}

onMounted(load)
</script>

<template>
  <section>
    <h2 class="text-lg font-semibold mb-3">History maintenance</h2>
    <p v-if="error" class="text-sm text-red-600 mb-3">{{ error }}</p>
    <div class="card p-4 max-w-2xl">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div class="text-2xl font-bold">{{ stats?.revisions ?? 0 }}</div>
          <div class="text-sm text-[var(--c-text-muted)]">Revisions</div>
        </div>
        <div>
          <div class="text-2xl font-bold">{{ formatBytes(stats?.historyBytes ?? 0) }}</div>
          <div class="text-sm text-[var(--c-text-muted)]">History data</div>
        </div>
        <label class="block">
          <span class="text-xs font-medium text-gray-500">Older than days</span>
          <input v-model.number="olderThanDays" class="input mt-1 h-9" type="number" min="1" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-gray-500">Keep per page</span>
          <input v-model.number="keepLatest" class="input mt-1 h-9" type="number" min="0" />
        </label>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button class="btn-danger" type="button" :disabled="purging || loading" @click="purge">
          {{ purging ? 'Purging...' : 'Purge old history' }}
        </button>
        <button class="btn-ghost" type="button" :disabled="loading" @click="load">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
        <span v-if="lastPurge" class="text-sm text-gray-500">
          Deleted {{ lastPurge.deleted }} revision{{ lastPurge.deleted === 1 ? '' : 's' }}.
        </span>
      </div>
    </div>
  </section>
</template>
