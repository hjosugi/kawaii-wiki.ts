<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Role } from '@ts-wiki/core'
import { Api, type ApiKeyView } from '@/lib/api'

const roles: Role[] = ['viewer', 'editor', 'admin']
const apiKeys = ref<ApiKeyView[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const message = ref<string | null>(null)
const name = ref('')
const role = ref<Role>('viewer')
const expiresAt = ref('')
const issuedSecret = ref('')
const issuedName = ref('')

function formatDate(value: number | null): string {
  if (value === null) return 'never'
  return new Date(value).toLocaleString()
}

function statusOf(apiKey: ApiKeyView): string {
  if (apiKey.revokedAt !== null) return 'revoked'
  if (apiKey.expiresAt !== null && apiKey.expiresAt <= Date.now()) return 'expired'
  return 'active'
}

function parsedExpiry(): number | null {
  if (!expiresAt.value) return null
  const timestamp = new Date(expiresAt.value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    apiKeys.value = await Api.adminApiKeys()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function createApiKey(): Promise<void> {
  busy.value = true
  error.value = null
  message.value = null
  try {
    const created = await Api.adminCreateApiKey({
      name: name.value,
      role: role.value,
      expiresAt: parsedExpiry(),
    })
    apiKeys.value = [...apiKeys.value, created.apiKey]
    issuedSecret.value = created.secret
    issuedName.value = created.apiKey.name
    name.value = ''
    role.value = 'viewer'
    expiresAt.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function copySecret(): Promise<void> {
  if (!issuedSecret.value) return
  try {
    await navigator.clipboard?.writeText(issuedSecret.value)
    message.value = 'Secret copied'
  } catch {
    message.value = 'Select and copy the secret before leaving this page'
  }
}

async function revokeApiKey(apiKey: ApiKeyView): Promise<void> {
  if (!confirm(`Revoke API key "${apiKey.name}"?`)) return
  busy.value = true
  error.value = null
  message.value = null
  try {
    const revoked = await Api.adminRevokeApiKey(apiKey.id)
    apiKeys.value = apiKeys.value.map((item) => (item.id === revoked.id ? revoked : item))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="font-medium">API keys</div>
        <div class="text-sm text-gray-500">{{ loading ? 'Loading...' : `${apiKeys.length} configured` }}</div>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-if="message" class="text-sm text-emerald-600">{{ message }}</p>

    <div v-if="issuedSecret" class="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2 dark:border-emerald-900 dark:bg-emerald-950">
      <div class="text-sm font-medium text-emerald-900 dark:text-emerald-100">{{ issuedName }} secret</div>
      <div class="flex flex-col sm:flex-row gap-2">
        <input class="input font-mono text-xs" :value="issuedSecret" readonly />
        <button class="btn-ghost shrink-0" type="button" @click="copySecret">Copy</button>
      </div>
      <p class="text-xs text-emerald-900 dark:text-emerald-100">This secret is shown once.</p>
    </div>

    <form class="grid md:grid-cols-[minmax(0,1fr)_9rem_minmax(12rem,14rem)_auto] gap-2" @submit.prevent="createApiKey">
      <input v-model="name" class="input" placeholder="Key name" />
      <select v-model="role" class="input">
        <option v-for="item in roles" :key="item" :value="item">{{ item }}</option>
      </select>
      <input v-model="expiresAt" class="input" type="datetime-local" />
      <button class="btn-primary" type="submit" :disabled="busy || !name.trim()">Create key</button>
    </form>

    <div v-if="!apiKeys.length && !loading" class="rounded-md border border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-800">
      No API keys yet.
    </div>
    <div
      v-for="apiKey in apiKeys"
      :key="apiKey.id"
      class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800"
    >
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium break-words">{{ apiKey.name }}</span>
          <span class="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">{{ apiKey.role }}</span>
          <span class="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">{{ statusOf(apiKey) }}</span>
        </div>
        <div class="text-xs text-gray-500">
          Expires {{ formatDate(apiKey.expiresAt) }}. Last used {{ formatDate(apiKey.lastUsedAt) }}.
        </div>
      </div>
      <button
        class="btn-danger"
        type="button"
        :disabled="busy || apiKey.revokedAt !== null"
        @click="revokeApiKey(apiKey)"
      >
        Revoke
      </button>
    </div>
  </div>
</template>
