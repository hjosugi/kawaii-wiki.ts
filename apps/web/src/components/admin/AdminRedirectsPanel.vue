<script setup lang="ts">
import { friendlyError } from '@/lib/friendlyErrors'
import { ref } from 'vue'
import { Api, type PageRedirectView } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import Skeleton from '@/components/Skeleton.vue'
import { useDialogs } from '@/composables/useDialogs'
import { useAsyncData } from '@/composables/useAsyncData'

const { data: redirects, loading, error, reload: load } = useAsyncData<PageRedirectView[]>(Api.redirects, { initial: [] })
const fromPath = ref('')
const toPath = ref('')
const adding = ref(false)
const { formatDateTime, t } = useI18n()
const dialogs = useDialogs()

async function createRedirect(): Promise<void> {
  error.value = null
  try {
    const redirect = await Api.createRedirect(fromPath.value, toPath.value)
    redirects.value = [...redirects.value.filter((item) => item.fromPath !== redirect.fromPath), redirect]
      .sort((a, b) => a.fromPath.localeCompare(b.fromPath))
    fromPath.value = ''
    toPath.value = ''
    adding.value = false
  } catch (e) {
    error.value = friendlyError(e)
  }
}

async function deleteRedirect(redirect: PageRedirectView): Promise<void> {
  if (!await dialogs.confirm({ message: `Delete redirect "/${redirect.fromPath}"?`, danger: true })) return
  error.value = null
  try {
    await Api.deleteRedirect(redirect.fromPath)
    redirects.value = redirects.value.filter((item) => item.fromPath !== redirect.fromPath)
  } catch (e) {
    error.value = friendlyError(e)
  }
}

</script>

<template>
  <section>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">{{ t('redirectsAndAliases') }}</h2>
      <div class="flex gap-2">
        <button class="btn-ghost" type="button" :disabled="loading" @click="load">{{ loading ? t('loading') : t('refresh') }}</button>
        <button class="btn-primary" type="button" @click="adding = !adding">{{ t('addRedirect') }}</button>
      </div>
    </div>
    <p v-if="error" class="text-sm text-red-600 mb-3">{{ error }}</p>
    <form v-if="adding" class="card mb-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end" @submit.prevent="createRedirect">
      <label class="grid gap-1 text-sm"><span class="font-medium">{{ t('oldPath') }}</span><input v-model.trim="fromPath" class="input font-mono" placeholder="old/path" /></label>
      <span class="hidden pb-2 text-[var(--c-text-muted)] sm:block" aria-hidden="true">→</span>
      <label class="grid gap-1 text-sm"><span class="font-medium">{{ t('targetPath') }}</span><input v-model.trim="toPath" class="input font-mono" placeholder="target/path" /></label>
      <button class="btn-primary justify-center" type="submit" :disabled="!fromPath || !toPath">{{ t('createAlias') }}</button>
    </form>
    <div v-if="!loading && !redirects.length" class="card p-8 text-center">
      <h3 class="font-semibold">{{ t('noRedirectsYet') }}</h3>
      <p class="mx-auto mt-2 max-w-lg text-sm text-[var(--c-text-muted)]">{{ t('redirectEmptyHint') }}</p>
      <button v-if="!adding" class="btn-primary mt-4" type="button" @click="adding = true">{{ t('addRedirect') }}</button>
    </div>
    <div v-else class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="text-left text-[var(--c-text-muted)] border-b border-gray-200 dark:border-gray-800">
            <tr>
              <th class="p-3 font-medium">{{ t('alias') }}</th>
              <th class="p-3 font-medium">{{ t('target') }}</th>
              <th class="p-3 font-medium">{{ t('created') }}</th>
              <th class="p-3 font-medium w-28">{{ t('actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && !redirects.length">
              <td class="p-3" colspan="4"><Skeleton label="Loading redirects" :lines="3" /></td>
            </tr>
            <tr v-for="redirect in redirects" :key="redirect.fromPath" class="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
              <td class="p-3 font-mono text-gray-700 dark:text-gray-200">/{{ redirect.fromPath }}</td>
              <td class="p-3">
                <RouterLink class="link-quiet font-mono" :to="'/' + redirect.toPath">/{{ redirect.toPath }}</RouterLink>
              </td>
              <td class="p-3 text-gray-500">{{ formatDateTime(redirect.createdAt) }}</td>
              <td class="p-3">
                <button class="btn-danger py-1 text-xs" type="button" @click="deleteRedirect(redirect)">{{ t('delete') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
    </div>
  </section>
</template>
