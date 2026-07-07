<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Api, type PageRedirectView } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const redirects = ref<PageRedirectView[]>([])
const fromPath = ref('')
const toPath = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const { formatDateTime } = useI18n()

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    redirects.value = await Api.redirects()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function createRedirect(): Promise<void> {
  error.value = null
  try {
    const redirect = await Api.createRedirect(fromPath.value, toPath.value)
    redirects.value = [...redirects.value.filter((item) => item.fromPath !== redirect.fromPath), redirect]
      .sort((a, b) => a.fromPath.localeCompare(b.fromPath))
    fromPath.value = ''
    toPath.value = ''
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function deleteRedirect(redirect: PageRedirectView): Promise<void> {
  if (!confirm(`Delete redirect "/${redirect.fromPath}"?`)) return
  error.value = null
  try {
    await Api.deleteRedirect(redirect.fromPath)
    redirects.value = redirects.value.filter((item) => item.fromPath !== redirect.fromPath)
  } catch (e) {
    error.value = (e as Error).message
  }
}

onMounted(load)
</script>

<template>
  <section>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">Redirects and aliases</h2>
      <button class="btn-ghost" type="button" :disabled="loading" @click="load">
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>
    <p v-if="error" class="text-sm text-red-600 mb-3">{{ error }}</p>
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4">
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="text-left text-gray-400 border-b border-gray-200 dark:border-gray-800">
            <tr>
              <th class="p-3 font-medium">Alias</th>
              <th class="p-3 font-medium">Target</th>
              <th class="p-3 font-medium">Created</th>
              <th class="p-3 font-medium w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!redirects.length">
              <td class="p-3 text-gray-500" colspan="4">{{ loading ? 'Loading...' : 'No redirects yet.' }}</td>
            </tr>
            <tr v-for="redirect in redirects" :key="redirect.fromPath" class="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
              <td class="p-3 font-mono text-gray-700 dark:text-gray-200">/{{ redirect.fromPath }}</td>
              <td class="p-3">
                <RouterLink class="link-quiet font-mono" :to="'/' + redirect.toPath">/{{ redirect.toPath }}</RouterLink>
              </td>
              <td class="p-3 text-gray-500">{{ formatDateTime(redirect.createdAt) }}</td>
              <td class="p-3">
                <button class="btn-danger py-1 text-xs" type="button" @click="deleteRedirect(redirect)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form class="card p-4 space-y-2" @submit.prevent="createRedirect">
        <input v-model.trim="fromPath" class="input" placeholder="old/path" />
        <input v-model.trim="toPath" class="input" placeholder="target/path" />
        <button class="btn-primary" type="submit" :disabled="!fromPath || !toPath">Create alias</button>
      </form>
    </div>
  </section>
</template>
