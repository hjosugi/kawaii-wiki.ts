import { computed, onMounted, ref } from 'vue'
import {
  defaultMarkdownFeatureSettings,
  loadMarkdownFeatureSettings,
  rendererForMarkdownFeatures,
  type MarkdownFeatureSettings,
} from '@/lib/markdownEnhance'

export function useMarkdownFeatures() {
  const markdownFeatures = ref<MarkdownFeatureSettings>({ ...defaultMarkdownFeatureSettings })

  onMounted(async () => {
    markdownFeatures.value = await loadMarkdownFeatureSettings()
  })

  const markdownRenderer = computed(() => rendererForMarkdownFeatures(markdownFeatures.value))

  return { markdownFeatures, markdownRenderer }
}
