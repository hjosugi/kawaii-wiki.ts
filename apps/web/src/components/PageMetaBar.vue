<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'

const props = defineProps<{
  isEdit: boolean
  saving: boolean
  savingTemplate: boolean
  coverUploading: boolean
  canSave: boolean
}>()

const emit = defineEmits<{
  save: []
  archive: []
  remove: []
  saveTemplate: []
  uploadCover: [files: FileList | null]
}>()

const title = defineModel<string>('title', { required: true })
const status = defineModel<'draft' | 'in-review' | 'verified' | 'outdated'>('status', { required: true })
const reviewAtDate = defineModel<string>('reviewAtDate', { required: true })
const publishAtDateTime = defineModel<string>('publishAtDateTime', { required: true })
const locale = defineModel<string>('locale', { required: true })
const pinned = defineModel<boolean>('pinned', { required: true })
const navOrderText = defineModel<string>('navOrderText', { required: true })
const icon = defineModel<string>('icon', { required: true })
const coverUrl = defineModel<string>('coverUrl', { required: true })
const coverPosition = defineModel<string>('coverPosition', { required: true })

const { t } = useI18n()
const iconOptions = ['⭐', '📘', '📝', '📣', '🎤', '🎨', '🗓️', '📌', '✅', '🔥', '🌸', '🧭', '💡', '⚙️', '🔒']
const coverPositions = ['center', 'top', 'bottom', 'left', 'right']
const coverPreviewStyle = computed(() => coverUrl.value
  ? {
      backgroundImage: `url(${JSON.stringify(coverUrl.value)})`,
      backgroundSize: 'cover',
      backgroundPosition: coverPosition.value,
    }
  : {})
</script>

<template>
  <section class="mb-4 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label class="grid gap-1 md:col-span-2">
        <span class="text-xs font-medium text-[var(--c-text-muted)]">{{ t('pageTitle') }}</span>
        <input v-model="title" class="input text-lg font-semibold" :placeholder="t('pageTitle')" :aria-label="t('pageTitle')" />
      </label>
      <label class="grid gap-1">
        <span class="text-xs font-medium text-[var(--c-text-muted)]">{{ t('pageStatus') }}</span>
        <select v-model="status" class="input" :aria-label="t('pageStatus')">
          <option value="draft">{{ t('draft') }}</option>
          <option value="in-review">{{ t('inReview') }}</option>
          <option value="verified">{{ t('verified') }}</option>
          <option value="outdated">{{ t('outdated') }}</option>
        </select>
      </label>
      <label class="grid gap-1">
        <span class="text-xs font-medium text-[var(--c-text-muted)]">{{ t('locale') }}</span>
        <input v-model="locale" class="input" :placeholder="t('locale')" :aria-label="t('locale')" />
      </label>
      <label class="grid gap-1">
        <span class="text-xs font-medium text-[var(--c-text-muted)]">{{ t('reviewDate') }}</span>
        <input v-model="reviewAtDate" class="input" type="date" :aria-label="t('reviewDate')" />
      </label>
      <label class="grid gap-1 md:col-span-2">
        <span class="text-xs font-medium text-[var(--c-text-muted)]">{{ t('publishAt') }}</span>
        <input v-model="publishAtDateTime" class="input" type="datetime-local" :aria-label="t('publishAt')" />
      </label>
      <label class="grid gap-1">
        <span class="text-xs font-medium text-[var(--c-text-muted)]">{{ t('navOrder') }}</span>
        <input v-model="navOrderText" class="input" inputmode="numeric" :placeholder="t('navOrder')" :aria-label="t('navOrder')" />
      </label>
      <label class="flex items-center gap-2 self-end rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm">
        <input v-model="pinned" type="checkbox" />
        <span>{{ t('pinned') }}</span>
      </label>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--c-border)] pt-3">
      <button class="btn-primary" :disabled="props.saving || !props.canSave" @click="emit('save')">
        {{ props.saving ? t('saving') : t('save') }}
      </button>
      <RouterLink class="btn-ghost" to="/_templates">{{ t('templates') }}</RouterLink>
      <button class="btn-ghost" type="button" :disabled="props.savingTemplate" @click="emit('saveTemplate')">{{ t('saveAsTemplate') }}</button>
      <span class="flex-1"></span>
      <button v-if="props.isEdit" class="btn-ghost" @click="emit('archive')">{{ t('archive') }}</button>
      <button v-if="props.isEdit" class="btn-danger" @click="emit('remove')">{{ t('delete') }}</button>
    </div>
  </section>

  <details class="mb-4 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
    <summary class="cursor-pointer text-sm font-medium">{{ t('pageAppearance') }}</summary>
    <section class="mt-3 grid gap-3 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
      <div class="space-y-2">
      <label class="block text-sm font-medium" for="page-icon">{{ t('pageIcon') }}</label>
      <div class="flex gap-2">
        <input id="page-icon" v-model="icon" class="input max-w-24 text-center text-xl" maxlength="16" placeholder="⭐" :aria-label="t('pageIcon')" />
        <button class="btn-ghost" type="button" @click="icon = ''">{{ t('clear') }}</button>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="option in iconOptions"
          :key="option"
          class="h-8 w-8 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-base hover:border-[var(--c-accent)]"
          type="button"
          :aria-label="t('useIcon', { icon: option })"
          @click="icon = option"
        >{{ option }}</button>
      </div>
      </div>
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
      <div class="space-y-2">
        <label class="block text-sm font-medium" for="cover-url">{{ t('coverImage') }}</label>
        <input id="cover-url" v-model="coverUrl" class="input" placeholder="/assets/cover.jpg" :aria-label="t('coverImageUrl')" />
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <select v-model="coverPosition" class="input max-w-36" :aria-label="t('coverPosition')">
            <option v-for="position in coverPositions" :key="position" :value="position">{{ position }}</option>
          </select>
          <input class="text-sm" type="file" accept="image/*" :aria-label="t('uploadCover')" @change="emit('uploadCover', ($event.target as HTMLInputElement).files)" />
          <span v-if="props.coverUploading" class="text-xs text-[var(--c-text-muted)]">{{ t('uploading') }}</span>
          <button v-if="coverUrl" class="btn-ghost py-1 text-xs" type="button" @click="coverUrl = ''">{{ t('removeCover') }}</button>
        </div>
      </div>
      <div class="min-h-28 overflow-hidden rounded-md border border-[var(--c-border)] bg-[var(--c-surface-muted)]" :style="coverPreviewStyle" aria-hidden="true">
        <div v-if="!coverUrl" class="grid h-full min-h-28 place-items-center text-xs text-[var(--c-text-muted)]">{{ t('noCover') }}</div>
      </div>
      </div>
    </section>
  </details>
</template>
