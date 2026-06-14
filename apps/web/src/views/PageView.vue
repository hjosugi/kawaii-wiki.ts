<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Api, type Page } from '@/lib/api'
import { paramToPath } from '@/router'
import { useAuth } from '@/stores/auth'
import PageToc from '@/components/PageToc.vue'

const route = useRoute()
const auth = useAuth()

const page = ref<Page | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

const path = computed(() => paramToPath(route.params.path) || 'home')
const toc = computed<{ id: string; text: string; level: number }[]>(() => {
  try {
    return JSON.parse(page.value?.toc ?? '[]')
  } catch {
    return []
  }
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  page.value = null
  try {
    page.value = await Api.getPage(path.value)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(path, load, { immediate: true })
</script>

<template>
  <div v-if="loading" class="text-gray-400">Loading…</div>

  <div v-else-if="page" class="flex gap-8">
    <article class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">{{ page.title }}</h1>
          <p class="text-gray-400 text-sm mt-1 font-mono">/{{ page.path }}</p>
        </div>
        <RouterLink
          v-if="auth.canEdit"
          :to="'/_edit/' + page.path"
          class="btn-ghost shrink-0"
        >
          Edit
        </RouterLink>
      </div>
      <div class="prose dark:prose-invert max-w-none" v-html="page.renderedHtml"></div>
    </article>

    <PageToc v-if="toc.length" :entries="toc" class="hidden lg:block w-56 shrink-0" />
  </div>

  <div v-else class="card p-8 text-center">
    <p class="text-gray-500 mb-1">
      There's no page at <code class="font-mono">/{{ path }}</code> yet.
    </p>
    <p v-if="error" class="text-xs text-gray-400 mb-4">{{ error }}</p>
    <div class="mt-4">
      <RouterLink v-if="auth.canEdit" :to="{ name: 'new', query: { path } }" class="btn-primary">
        Create this page
      </RouterLink>
      <RouterLink v-else to="/_login" class="btn-ghost">Sign in to create it</RouterLink>
    </div>
  </div>
</template>
