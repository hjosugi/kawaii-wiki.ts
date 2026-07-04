<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Api, type AdminUserView, type AdminStats, type AssetView, type PageSummary, type AnalyticsSummary, type PublicSettings } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { usePages } from '@/stores/pages'

const auth = useAuth()
const router = useRouter()
const pagesStore = usePages()

const stats = ref<AdminStats | null>(null)
const analytics = ref<AnalyticsSummary | null>(null)
const settings = ref<PublicSettings | null>(null)
const users = ref<AdminUserView[]>([])
const assets = ref<AssetView[]>([])
const trash = ref<PageSummary[]>([])
const error = ref<string | null>(null)
const loading = ref(true)
const importPath = ref('')
const importContent = ref('')
const importLabels = ref('')
const importStatus = ref<'draft' | 'in-review' | 'verified' | 'outdated'>('draft')
const importing = ref(false)
const settingsSaving = ref(false)
const navLinksText = ref('')

const ROLES = ['admin', 'editor', 'viewer'] as const
type RoleName = (typeof ROLES)[number]

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [s, an, set, u, a, t] = await Promise.all([
      Api.adminStats(),
      Api.adminAnalytics(),
      Api.publicSettings(),
      Api.adminUsers(),
      Api.listAssets(),
      Api.trashPages(),
    ])
    stats.value = s
    analytics.value = an
    settings.value = set
    navLinksText.value = set.navLinks.map((link) => `${link.label}|${link.url}`).join('\n')
    users.value = u
    assets.value = a
    trash.value = t
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function restorePage(path: string): Promise<void> {
  error.value = null
  try {
    await Api.restorePage(path)
    await Promise.all([load(), pagesStore.refresh()])
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function purgePage(path: string): Promise<void> {
  if (!confirm(`Purge "/${path}" permanently?`)) return
  error.value = null
  try {
    await Api.purgePage(path)
    await Promise.all([load(), pagesStore.refresh()])
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function deleteAsset(asset: AssetView): Promise<void> {
  if (!confirm(`Delete asset "${asset.filename}"?`)) return
  error.value = null
  try {
    await Api.deleteAsset(asset.id)
    assets.value = assets.value.filter((item) => item.id !== asset.id)
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

const formatBytes = (value: number): string =>
  value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`

async function exportSite(): Promise<void> {
  error.value = null
  try {
    const backup = await Api.exportSite()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ts-wiki-backup-${backup.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function importMarkdown(): Promise<void> {
  importing.value = true
  error.value = null
  try {
    await Api.importMarkdown({
      path: importPath.value,
      content: importContent.value,
      labels: importLabels.value.split(',').map((label) => label.trim()).filter(Boolean),
      status: importStatus.value,
    })
    importPath.value = ''
    importContent.value = ''
    importLabels.value = ''
    importStatus.value = 'draft'
    await Promise.all([load(), pagesStore.refresh()])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    importing.value = false
  }
}

function parseNavLinks(): PublicSettings['navLinks'] {
  return navLinksText.value
    .split(/\r?\n/)
    .map((line) => {
      const [label = '', url = ''] = line.split('|')
      return { label: label.trim(), url: url.trim() }
    })
    .filter((link) => link.label && link.url)
}

async function saveSettings(): Promise<void> {
  if (!settings.value) return
  settingsSaving.value = true
  error.value = null
  try {
    settings.value = await Api.adminUpdateSettings({
      siteTitle: settings.value.siteTitle,
      accentColor: settings.value.accentColor,
      theme: settings.value.theme,
      navLinks: parseNavLinks(),
    })
    navLinksText.value = settings.value.navLinks.map((link) => `${link.label}|${link.url}`).join('\n')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    settingsSaving.value = false
  }
}

async function changeRole(user: AdminUserView, role: RoleName): Promise<void> {
  if (role === user.role) return
  const previous = user.role
  user.role = role // optimistic
  try {
    const updated = await Api.adminSetRole(user.id, role)
    user.role = updated.role
    if (stats.value) stats.value = await Api.adminStats()
  } catch (e) {
    user.role = previous // revert on failure
    error.value = (e as Error).message
  }
}

onMounted(() => {
  if (!auth.isAdmin) {
    router.replace('/')
    return
  }
  void load()
})
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold tracking-tight mb-6">Admin</h1>
    <p v-if="error" class="text-sm text-red-600 mb-4">{{ error }}</p>
    <p v-if="loading" class="text-gray-400">Loading…</p>

    <!-- Stats -->
    <div v-if="stats" class="grid grid-cols-3 gap-4 mb-10 max-w-xl">
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

    <div v-if="analytics" class="mb-10 max-w-xl">
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

    <!-- Users -->
    <h2 class="text-lg font-semibold mb-3">Users</h2>
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-left text-gray-400 border-b border-gray-200 dark:border-gray-800">
          <tr>
            <th class="p-3 font-medium">Name</th>
            <th class="p-3 font-medium">Email</th>
            <th class="p-3 font-medium w-44">Role</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in users"
            :key="u.id"
            class="border-b border-gray-100 dark:border-gray-800/60 last:border-0"
          >
            <td class="p-3 font-medium">{{ u.name }}</td>
            <td class="p-3 text-gray-500">{{ u.email }}</td>
            <td class="p-3">
              <select
                class="input py-1"
                :value="u.role"
                @change="changeRole(u, ($event.target as HTMLSelectElement).value as RoleName)"
              >
                <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
              </select>
              <span v-if="u.id === auth.user?.id" class="text-xs text-gray-400 ml-2">(you)</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 class="text-lg font-semibold mt-10 mb-3">Appearance</h2>
    <form v-if="settings" class="card p-4 space-y-3 max-w-xl" @submit.prevent="saveSettings">
      <input v-model="settings.siteTitle" class="input" placeholder="Site title" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input v-model="settings.accentColor" class="input" placeholder="#7c3aed" />
        <select v-model="settings.theme" class="input">
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </div>
      <textarea
        v-model="navLinksText"
        class="input min-h-24 font-mono text-sm"
        placeholder="Docs|/docs&#10;Status|https://status.example.com"
      ></textarea>
      <button class="btn-primary" type="submit" :disabled="settingsSaving">
        {{ settingsSaving ? 'Saving...' : 'Save appearance' }}
      </button>
    </form>

    <h2 class="text-lg font-semibold mt-10 mb-3">Backup and Import</h2>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section class="card p-4">
        <h3 class="font-semibold mb-3">Site export</h3>
        <button class="btn-primary" type="button" @click="exportSite">Download JSON</button>
      </section>
      <form class="card p-4 space-y-3" @submit.prevent="importMarkdown">
        <h3 class="font-semibold">Markdown import</h3>
        <input v-model="importPath" class="input" placeholder="path/to/page" />
        <textarea v-model="importContent" class="input min-h-40 font-mono text-sm" placeholder="Markdown with optional frontmatter"></textarea>
        <input v-model="importLabels" class="input" placeholder="labels, comma separated" />
        <select v-model="importStatus" class="input">
          <option value="draft">draft</option>
          <option value="in-review">in-review</option>
          <option value="verified">verified</option>
          <option value="outdated">outdated</option>
        </select>
        <button class="btn-primary" type="submit" :disabled="importing || !importPath || !importContent">
          {{ importing ? 'Importing...' : 'Import Markdown' }}
        </button>
      </form>
    </div>

    <h2 class="text-lg font-semibold mt-10 mb-3">Trash and Archive</h2>
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-left text-gray-400 border-b border-gray-200 dark:border-gray-800">
          <tr>
            <th class="p-3 font-medium">Page</th>
            <th class="p-3 font-medium">State</th>
            <th class="p-3 font-medium w-52">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!trash.length">
            <td class="p-3 text-gray-500" colspan="3">No archived or trashed pages.</td>
          </tr>
          <tr
            v-for="page in trash"
            :key="page.path"
            class="border-b border-gray-100 dark:border-gray-800/60 last:border-0"
          >
            <td class="p-3">
              <div class="font-medium">{{ page.title }}</div>
              <div class="text-xs font-mono text-gray-500">/{{ page.path }}</div>
            </td>
            <td class="p-3 text-gray-500">{{ page.lifecycle }}</td>
            <td class="p-3">
              <div class="flex flex-wrap gap-2">
                <button class="btn-ghost" type="button" @click="restorePage(page.path)">Restore</button>
                <button class="btn-danger" type="button" @click="purgePage(page.path)">Purge</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 class="text-lg font-semibold mt-10 mb-3">Assets</h2>
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-left text-gray-400 border-b border-gray-200 dark:border-gray-800">
          <tr>
            <th class="p-3 font-medium">File</th>
            <th class="p-3 font-medium">Type</th>
            <th class="p-3 font-medium">Size</th>
            <th class="p-3 font-medium w-48">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!assets.length">
            <td class="p-3 text-gray-500" colspan="4">No uploaded assets yet.</td>
          </tr>
          <tr
            v-for="asset in assets"
            :key="asset.id"
            class="border-b border-gray-100 dark:border-gray-800/60 last:border-0"
          >
            <td class="p-3">
              <a :href="asset.url" class="link-quiet font-medium" target="_blank" rel="noopener noreferrer">
                {{ asset.filename }}
              </a>
              <div class="text-xs font-mono text-gray-500">{{ asset.url }}</div>
            </td>
            <td class="p-3 text-gray-500">{{ asset.mime }}</td>
            <td class="p-3 text-gray-500">{{ formatBytes(asset.size) }}</td>
            <td class="p-3">
              <div class="flex flex-wrap gap-2">
                <button class="btn-ghost" type="button" @click="renameAsset(asset)">Rename</button>
                <button class="btn-danger" type="button" @click="deleteAsset(asset)">Delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
