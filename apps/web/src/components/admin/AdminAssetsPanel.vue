<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Api, type AssetUsagePage, type AssetView } from '@/lib/api'

const assets = ref<AssetView[]>([])
const usageByAssetId = ref<Record<string, AssetUsagePage[]>>({})
const orphanAssetIds = ref<string[]>([])
const selectedOrphanIds = ref<string[]>([])
const loading = ref(false)
const cleaning = ref(false)
const error = ref<string | null>(null)

const formatBytes = (value: number): string =>
  value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [nextAssets, nextUsage, nextOrphans] = await Promise.all([
      Api.listAssets(),
      Api.assetUsage(),
      Api.orphanAssets(),
    ])
    assets.value = nextAssets
    usageByAssetId.value = Object.fromEntries(nextUsage.map((entry) => [entry.asset.id, entry.pages]))
    orphanAssetIds.value = nextOrphans.map((asset) => asset.id)
    selectedOrphanIds.value = selectedOrphanIds.value.filter((id) => orphanAssetIds.value.includes(id))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function deleteAsset(asset: AssetView): Promise<void> {
  if (!confirm(`Delete asset "${asset.filename}"?`)) return
  error.value = null
  try {
    await Api.deleteAsset(asset.id)
    assets.value = assets.value.filter((item) => item.id !== asset.id)
    const nextUsage = { ...usageByAssetId.value }
    delete nextUsage[asset.id]
    usageByAssetId.value = nextUsage
    orphanAssetIds.value = orphanAssetIds.value.filter((id) => id !== asset.id)
    selectedOrphanIds.value = selectedOrphanIds.value.filter((id) => id !== asset.id)
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function renameAsset(asset: AssetView): Promise<void> {
  const filename = prompt('Asset filename', asset.filename)?.trim()
  if (!filename || filename === asset.filename) return
  error.value = null
  try {
    const renamed = await Api.renameAsset(asset.id, filename)
    assets.value = assets.value.map((item) => (item.id === renamed.id ? renamed : item))
  } catch (e) {
    error.value = (e as Error).message
  }
}

const usedOn = (asset: AssetView): AssetUsagePage[] => usageByAssetId.value[asset.id] ?? []
const orphanIdSet = computed(() => new Set(orphanAssetIds.value))
const orphanAssets = computed(() => assets.value.filter((asset) => orphanIdSet.value.has(asset.id)))
const isOrphan = (asset: AssetView): boolean => orphanIdSet.value.has(asset.id)
const isSelected = (asset: AssetView): boolean => selectedOrphanIds.value.includes(asset.id)

function toggleOrphan(asset: AssetView): void {
  if (!isOrphan(asset)) return
  selectedOrphanIds.value = isSelected(asset)
    ? selectedOrphanIds.value.filter((id) => id !== asset.id)
    : [...selectedOrphanIds.value, asset.id]
}

function selectAllOrphans(): void {
  selectedOrphanIds.value = orphanAssets.value.map((asset) => asset.id)
}

function clearSelection(): void {
  selectedOrphanIds.value = []
}

async function deleteSelectedOrphans(): Promise<void> {
  const ids = [...selectedOrphanIds.value]
  if (!ids.length) return
  if (!confirm(`Delete ${ids.length} orphaned asset${ids.length === 1 ? '' : 's'}? This removes the stored files.`)) return
  cleaning.value = true
  error.value = null
  try {
    const result = await Api.deleteOrphanAssets(ids)
    selectedOrphanIds.value = []
    await load()
    if (result.skipped) {
      error.value = `${result.skipped} selected asset${result.skipped === 1 ? '' : 's'} skipped because it is now used.`
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    cleaning.value = false
  }
}

onMounted(load)
</script>

<template>
  <section>
    <h2 class="text-lg font-semibold mb-3">Assets</h2>
    <p v-if="error" class="text-sm text-red-600 mb-3">{{ error }}</p>
    <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-gray-500">{{ orphanAssets.length }} orphaned</span>
      <button class="btn-ghost" type="button" :disabled="!orphanAssets.length || cleaning" @click="selectAllOrphans">
        Select all orphans
      </button>
      <button class="btn-ghost" type="button" :disabled="!selectedOrphanIds.length || cleaning" @click="clearSelection">
        Clear selection
      </button>
      <button class="btn-danger" type="button" :disabled="!selectedOrphanIds.length || cleaning" @click="deleteSelectedOrphans">
        {{ cleaning ? 'Deleting...' : `Delete selected (${selectedOrphanIds.length})` }}
      </button>
    </div>
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-left text-gray-400 border-b border-gray-200 dark:border-gray-800">
          <tr><th class="p-3 font-medium w-10">Select</th><th class="p-3 font-medium">File</th><th class="p-3 font-medium">Type</th><th class="p-3 font-medium">Size</th><th class="p-3 font-medium">Used on</th><th class="p-3 font-medium w-48">Actions</th></tr>
        </thead>
        <tbody>
          <tr v-if="!assets.length"><td class="p-3 text-gray-500" colspan="6">{{ loading ? 'Loading...' : 'No uploaded assets yet.' }}</td></tr>
          <tr v-for="asset in assets" :key="asset.id" class="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
            <td class="p-3">
              <input
                v-if="isOrphan(asset)"
                type="checkbox"
                :checked="isSelected(asset)"
                :aria-label="`Select ${asset.filename}`"
                @change="toggleOrphan(asset)"
              />
              <span v-else class="text-xs text-gray-300">--</span>
            </td>
            <td class="p-3"><a :href="asset.url" class="link-quiet font-medium" target="_blank" rel="noopener noreferrer">{{ asset.filename }}</a><div class="text-xs font-mono text-gray-500">{{ asset.url }}</div></td>
            <td class="p-3 text-gray-500">{{ asset.mime }}</td>
            <td class="p-3 text-gray-500">{{ formatBytes(asset.size) }}</td>
            <td class="p-3 text-gray-500">
              <span v-if="!usedOn(asset).length" :class="isOrphan(asset) ? 'text-amber-600 dark:text-amber-400' : ''">
                {{ isOrphan(asset) ? 'Orphan' : 'Unused' }}
              </span>
              <div v-else class="flex flex-wrap gap-1.5">
                <RouterLink
                  v-for="page in usedOn(asset).slice(0, 3)"
                  :key="page.path"
                  :to="'/' + page.path"
                  class="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:border-violet-400 dark:border-gray-800 dark:text-gray-300"
                >
                  {{ page.title }}
                </RouterLink>
                <span v-if="usedOn(asset).length > 3" class="px-2 py-0.5 text-xs text-gray-400">
                  +{{ usedOn(asset).length - 3 }}
                </span>
              </div>
            </td>
            <td class="p-3"><div class="flex flex-wrap gap-2"><button class="btn-ghost" type="button" @click="renameAsset(asset)">Rename</button><button class="btn-danger" type="button" @click="deleteAsset(asset)">Delete</button></div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
