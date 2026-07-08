<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Api, type Page, type PageShareView } from '@/lib/api'
import WikiBreadcrumbs from '@/components/WikiBreadcrumbs.vue'
import { useI18n } from '@/lib/i18n'

const props = defineProps<{
  page: Page
  canEdit: boolean
  homePath?: string
}>()

const copied = ref(false)
const share = ref<PageShareView | null>(null)
const shareBusy = ref(false)
const shareMessage = ref<string | null>(null)
const shareError = ref<string | null>(null)
const { formatDate, formatDateTime, t } = useI18n()

const updated = computed(() =>
  formatDateTime(props.page.updatedAt),
)

const childPath = computed(() => `${props.page.path}/new-page`)
const markdownExportUrl = computed(() => `/api/export/page?path=${encodeURIComponent(props.page.path)}&format=markdown`)
const htmlExportUrl = computed(() => `/api/export/page?path=${encodeURIComponent(props.page.path)}&format=html`)
const labels = computed<string[]>(() => {
  try {
    const parsed = JSON.parse(props.page.labels) as unknown
    return Array.isArray(parsed) ? parsed.filter((label): label is string => typeof label === 'string') : []
  } catch {
    return []
  }
})
const reviewDate = computed(() =>
  props.page.reviewAt ? formatDate(props.page.reviewAt) : null,
)
const shareUrl = computed(() =>
  share.value ? `${window.location.origin}/_share/${encodeURIComponent(share.value.token)}` : '',
)

async function loadShare(): Promise<void> {
  if (!props.canEdit) {
    share.value = null
    return
  }
  try {
    share.value = await Api.currentPageShare(props.page.path)
  } catch {
    share.value = null
  }
}

async function copyPath(): Promise<void> {
  await navigator.clipboard?.writeText('/' + props.page.path)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1200)
}

async function copyShareLink(): Promise<void> {
  if (!shareUrl.value) return
  const canCopy = Boolean(navigator.clipboard?.writeText)
  if (canCopy) await navigator.clipboard.writeText(shareUrl.value)
  shareMessage.value = canCopy ? t('shareLinkCopied') : shareUrl.value
  shareError.value = null
}

async function createShareLink(): Promise<void> {
  shareBusy.value = true
  shareError.value = null
  try {
    share.value = await Api.createPageShare(props.page.path)
    shareMessage.value = t('shareReady')
    await copyShareLink()
  } catch (e) {
    shareError.value = (e as Error).message
  } finally {
    shareBusy.value = false
  }
}

async function revokeShareLink(): Promise<void> {
  if (!share.value) return
  shareBusy.value = true
  shareError.value = null
  try {
    await Api.revokePageShare(share.value.token)
    share.value = null
    shareMessage.value = null
  } catch (e) {
    shareError.value = (e as Error).message
  } finally {
    shareBusy.value = false
  }
}

watch(() => [props.page.path, props.canEdit] as const, () => {
  shareMessage.value = null
  shareError.value = null
  void loadShare()
}, { immediate: true })
</script>

<template>
  <header class="border-b border-gray-200 dark:border-gray-800 pb-5 mb-7">
    <WikiBreadcrumbs :path="page.path" :home-path="homePath" />

    <div class="flex flex-wrap items-start justify-between gap-4 mt-3">
      <div class="min-w-0">
        <h1 class="text-3xl font-bold tracking-tight text-gray-950 dark:text-gray-50">{{ page.title }}</h1>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          <span class="font-mono">/{{ page.path }}</span>
          <span>{{ t('space', { space: page.spaceKey }) }}</span>
          <span>{{ t('locale') }} {{ page.locale }}</span>
          <span>{{ t('updated', { date: updated }) }}</span>
          <span class="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold capitalize text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            {{ page.status }}
          </span>
          <span v-if="reviewDate">{{ t('review', { date: reviewDate }) }}</span>
        </div>
        <div v-if="labels.length" class="mt-3 flex flex-wrap gap-1.5">
          <RouterLink
            v-for="label in labels"
            :key="label"
            :to="{ name: 'search', query: { q: label, label } }"
            class="rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-200"
          >
            #{{ label }}
          </RouterLink>
        </div>
      </div>

      <div class="shrink-0 space-y-2">
        <div class="flex flex-wrap justify-end gap-2">
          <button class="btn-ghost" type="button" @click="copyPath">
            {{ copied ? t('copied') : t('copyPath') }}
          </button>
          <button
            v-if="canEdit"
            class="btn-ghost"
            type="button"
            :disabled="shareBusy"
            @click="share ? copyShareLink() : createShareLink()"
          >
            {{ share ? t('copyShareLink') : t('share') }}
          </button>
          <button
            v-if="canEdit && share"
            class="btn-ghost"
            type="button"
            :disabled="shareBusy"
            @click="revokeShareLink"
          >
            {{ t('revokeShare') }}
          </button>
          <RouterLink v-if="canEdit" :to="{ name: 'new', query: { path: childPath } }" class="btn-ghost">
            {{ t('newChild') }}
          </RouterLink>
          <RouterLink :to="'/_history/' + page.path" class="btn-ghost">
            {{ t('history') }}
          </RouterLink>
          <a class="btn-ghost" :href="markdownExportUrl">{{ t('markdown') }}</a>
          <a class="btn-ghost" :href="htmlExportUrl">{{ t('html') }}</a>
          <RouterLink v-if="canEdit" :to="'/_edit/' + page.path" class="btn-primary">
            {{ t('edit') }}
          </RouterLink>
        </div>
        <p v-if="shareError" class="text-right text-xs text-red-600">{{ shareError }}</p>
        <p v-else-if="shareMessage" class="text-right text-xs text-gray-500">{{ shareMessage }}</p>
      </div>
    </div>
  </header>
</template>
