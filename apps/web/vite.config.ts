import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Consume the core package as TypeScript source so Vite transpiles it.
      '@wiki/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // 5180 (not Vite's default 5173) to avoid colliding with other local dev
    // servers; strictPort:false so it falls back to the next free port anyway.
    port: 5180,
    strictPort: false,
  },
})
