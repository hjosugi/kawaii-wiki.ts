import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'uno.css'
import '@unocss/reset/tailwind.css'
import 'highlight.js/styles/github-dark.css'
import './app.css'

import App from './App.vue'
import { router } from './router'
import { useAuth } from './stores/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// Best-effort: resolve the logged-in user in the background.
void useAuth().fetchMe()
