<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Api, type UserProfileResponse } from '@/lib/api'
import { useMarkdownFeatures } from '@/composables/useMarkdownFeatures'
import { vMarkdownEnhance } from '@/lib/markdownEnhance'
import EmptyState from '@/components/EmptyState.vue'
import Skeleton from '@/components/Skeleton.vue'

const route = useRoute()
const { markdownFeatures, markdownRenderer } = useMarkdownFeatures()
const profile = ref<UserProfileResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const userId = computed(() => String(route.params.id ?? ''))
const bioHtml = computed(() => markdownRenderer.value.renderMarkdown(profile.value?.profile.profileBio ?? '').html)

async function load(): Promise<void> {
  if (!userId.value) return
  loading.value = true
  error.value = null
  profile.value = null
  try {
    profile.value = await Api.userProfile(userId.value)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(userId, load, { immediate: true })
</script>

<template>
  <Skeleton v-if="loading" label="Loading profile" title :lines="5" />

  <article v-else-if="profile" class="profile-page">
    <div
      class="profile-cover"
      :style="profile.profile.profileCoverUrl ? { backgroundImage: `url(${profile.profile.profileCoverUrl})` } : undefined"
    ></div>
    <section class="profile-main">
      <div class="profile-avatar" aria-hidden="true">
        {{ (profile.profile.name[0] ?? '?').toUpperCase() }}
      </div>
      <div class="min-w-0">
        <h1>{{ profile.profile.name }}</h1>
        <p class="profile-role">{{ profile.profile.role }}</p>
      </div>
    </section>

    <div
      v-if="profile.profile.profileBio"
      v-markdown-enhance="markdownFeatures"
      class="prose dark:prose-invert profile-bio"
      v-html="bioHtml"
    ></div>

    <section v-if="profile.profile.profileLinks.length" class="profile-links" aria-label="Profile links">
      <a
        v-for="link in profile.profile.profileLinks"
        :key="link.url"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ link.label }}
      </a>
    </section>

    <section v-if="profile.favoritePages.length" class="profile-section">
      <h2>Featured pages</h2>
      <div class="profile-page-grid">
        <RouterLink v-for="page in profile.favoritePages" :key="page.path" :to="'/' + page.path">
          <strong>{{ page.title }}</strong>
          <span>/{{ page.path }}</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="profile.authoredPages.length" class="profile-section">
      <h2>Recent pages</h2>
      <div class="profile-page-grid">
        <RouterLink v-for="page in profile.authoredPages" :key="page.path" :to="'/' + page.path">
          <strong>{{ page.title }}</strong>
          <span>/{{ page.path }}</span>
        </RouterLink>
      </div>
    </section>
  </article>

  <EmptyState v-else title="Profile not found" :message="error ?? userId" />
</template>
