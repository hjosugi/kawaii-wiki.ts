<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Api, type PublicSettings } from '@/lib/api'

const settings = ref<Pick<PublicSettings, 'footerText' | 'footerLinks'> | null>(null)

onMounted(async () => {
  try {
    const next = await Api.publicSettings()
    settings.value = { footerText: next.footerText, footerLinks: next.footerLinks }
  } catch {
    settings.value = null
  }
})
</script>

<template>
  <footer
    v-if="settings && (settings.footerText || settings.footerLinks.length)"
    class="mx-auto w-full max-w-7xl px-4 py-6 text-sm text-[var(--c-text-muted)] print:hidden"
  >
    <div class="flex flex-col gap-2 border-t border-[var(--c-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p v-if="settings.footerText">{{ settings.footerText }}</p>
      <nav v-if="settings.footerLinks.length" class="flex flex-wrap gap-3">
        <a
          v-for="link in settings.footerLinks"
          :key="link.url + link.label"
          class="hover:text-[var(--c-accent)]"
          :href="link.url"
        >
          {{ link.label }}
        </a>
      </nav>
    </div>
  </footer>
</template>
