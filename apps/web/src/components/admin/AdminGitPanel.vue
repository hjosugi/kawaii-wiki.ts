<script setup lang="ts">
import { ref } from 'vue'
import { Api, type GitStatus } from '@/lib/api'
import { useAsyncData } from '@/composables/useAsyncData'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/lib/i18n'
import Skeleton from '@/components/Skeleton.vue'

const state = useAsyncData(Api.gitStatus)
const syncing = ref(false)
const toast = useToast()
const { formatDateTime } = useI18n()

const sync = async (): Promise<void> => {
  syncing.value = true
  try {
    const result = await Api.gitSync()
    toast.success(`Git sync completed: ${result.upserted.length} imported, ${result.deleted.length} deleted.`)
    await state.reload()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    syncing.value = false
  }
}

const status = (): GitStatus | undefined => state.data.value
</script>

<template>
  <section>
    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">Git mirror</h2>
      <button class="btn-primary" type="button" :disabled="syncing || !status()?.enabled" @click="sync">{{ syncing ? 'Syncing...' : 'Sync now' }}</button>
    </div>
    <Skeleton v-if="state.loading.value" label="Loading Git status" :lines="4" />
    <div v-else-if="status()" class="card grid gap-3 p-4 text-sm sm:grid-cols-2">
      <div><span class="text-[var(--c-text-muted)]">State</span><div class="font-medium">{{ status()?.enabled ? 'Enabled' : 'Disabled' }}</div></div>
      <div><span class="text-[var(--c-text-muted)]">Branch</span><div class="font-mono">{{ status()?.branch }}</div></div>
      <div><span class="text-[var(--c-text-muted)]">Remote</span><div class="font-mono break-all">{{ status()?.remote || 'None' }}</div></div>
      <div><span class="text-[var(--c-text-muted)]">HEAD</span><div class="font-mono break-all">{{ status()?.head || 'None' }}</div></div>
      <div><span class="text-[var(--c-text-muted)]">Last success</span><div>{{ status()?.lastSuccessAt ? formatDateTime(status()!.lastSuccessAt!) : 'Never' }}</div></div>
      <div><span class="text-[var(--c-text-muted)]">Work tree</span><div>{{ status()?.clean ? 'Clean' : 'Has changes' }}</div></div>
      <div v-if="status()?.lastError" class="sm:col-span-2 rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:bg-red-950/30 dark:text-red-200">
        <strong>Last error{{ status()?.lastErrorAt ? ` (${formatDateTime(status()!.lastErrorAt!)})` : '' }}</strong>
        <p class="mt-1 whitespace-pre-wrap">{{ status()?.lastError }}</p>
      </div>
    </div>
  </section>
</template>
