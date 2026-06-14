<script setup lang="ts">
import { onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { usePages } from '@/stores/pages'

const pages = usePages()
onMounted(() => pages.refresh())

const depthOf = (path: string): number => path.match(/\//g)?.length ?? 0
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <AppHeader />
    <div class="flex-1 w-full max-w-7xl mx-auto px-4 flex gap-6">
      <aside class="hidden md:block w-60 shrink-0 py-6">
        <div class="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2 px-2">Pages</div>
        <nav class="flex flex-col gap-0.5">
          <RouterLink
            v-for="p in pages.list"
            :key="p.path"
            :to="'/' + p.path"
            class="px-2 py-1 rounded text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 truncate"
            :style="{ paddingLeft: 0.5 + depthOf(p.path) * 0.75 + 'rem' }"
          >
            {{ p.title }}
          </RouterLink>
          <span v-if="!pages.list.length" class="px-2 py-1 text-sm text-gray-400">No pages yet</span>
        </nav>
      </aside>

      <main class="flex-1 min-w-0 py-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
