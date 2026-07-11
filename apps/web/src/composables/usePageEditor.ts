import { computed, ref } from 'vue'
import type { Page } from '@/lib/api'

export type PageEditorStatus = 'draft' | 'in-review' | 'verified' | 'outdated'

export interface PageEditorDraft {
  title: string
  path: string
  content: string
  icon: string
  coverUrl: string
  coverPosition: string
  labelsText: string
  status: PageEditorStatus
  reviewAtDate: string
  publishAtDateTime: string
  locale: string
  navOrderText: string
  pinned: boolean
}

const dateInputValue = (value: number | null): string =>
  value ? new Date(value).toISOString().slice(0, 10) : ''

const dateTimeInputValue = (value: number | null): string => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export const usePageEditor = () => {
  const title = ref('')
  const path = ref('')
  const originalPath = ref('')
  const originalUpdatedAt = ref<number | null>(null)
  const content = ref('')
  const icon = ref('')
  const coverUrl = ref('')
  const coverPosition = ref('center')
  const labelsText = ref('')
  const status = ref<PageEditorStatus>('draft')
  const reviewAtDate = ref('')
  const publishAtDateTime = ref('')
  const locale = ref('und')
  const navOrderText = ref('')
  const pinned = ref(false)
  const conflictDraft = ref<PageEditorDraft | null>(null)

  const captureDraft = (): PageEditorDraft => ({
    title: title.value,
    path: path.value,
    content: content.value,
    icon: icon.value,
    coverUrl: coverUrl.value,
    coverPosition: coverPosition.value,
    labelsText: labelsText.value,
    status: status.value,
    reviewAtDate: reviewAtDate.value,
    publishAtDateTime: publishAtDateTime.value,
    locale: locale.value,
    navOrderText: navOrderText.value,
    pinned: pinned.value,
  })

  const savedDraft = ref<PageEditorDraft>(captureDraft())
  const dirty = computed(() => JSON.stringify(captureDraft()) !== JSON.stringify(savedDraft.value))

  const applyDraft = (draft: PageEditorDraft): void => {
    title.value = draft.title
    path.value = draft.path
    content.value = draft.content
    icon.value = draft.icon
    coverUrl.value = draft.coverUrl
    coverPosition.value = draft.coverPosition
    labelsText.value = draft.labelsText
    status.value = draft.status
    reviewAtDate.value = draft.reviewAtDate
    publishAtDateTime.value = draft.publishAtDateTime
    locale.value = draft.locale
    navOrderText.value = draft.navOrderText
    pinned.value = draft.pinned
  }

  const applyPage = (page: Page): void => {
    title.value = page.title
    path.value = page.path
    originalPath.value = page.path
    originalUpdatedAt.value = page.updatedAt
    content.value = page.content
    icon.value = page.icon
    coverUrl.value = page.coverUrl
    coverPosition.value = page.coverPosition || 'center'
    labelsText.value = page.labels.join(', ')
    status.value = page.status
    reviewAtDate.value = dateInputValue(page.reviewAt)
    publishAtDateTime.value = dateTimeInputValue(page.publishAt)
    locale.value = page.locale
    navOrderText.value = page.navOrder === null ? '' : String(page.navOrder)
    pinned.value = page.pinned
  }

  const markSaved = (): void => {
    savedDraft.value = captureDraft()
  }

  const labels = (): string[] => labelsText.value.split(',').map((label) => label.trim()).filter(Boolean)
  const reviewAt = (): number | null => reviewAtDate.value ? new Date(`${reviewAtDate.value}T00:00:00`).getTime() : null
  const publishAt = (): number | null => {
    const value = publishAtDateTime.value ? new Date(publishAtDateTime.value).getTime() : Number.NaN
    return Number.isFinite(value) ? value : null
  }
  const navOrder = (): number | null => {
    const trimmed = navOrderText.value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }

  return {
    title,
    path,
    originalPath,
    originalUpdatedAt,
    content,
    icon,
    coverUrl,
    coverPosition,
    labelsText,
    status,
    reviewAtDate,
    publishAtDateTime,
    locale,
    navOrderText,
    pinned,
    conflictDraft,
    dirty,
    captureDraft,
    applyDraft,
    applyPage,
    markSaved,
    labels,
    reviewAt,
    publishAt,
    navOrder,
    dateInputValue,
  }
}
