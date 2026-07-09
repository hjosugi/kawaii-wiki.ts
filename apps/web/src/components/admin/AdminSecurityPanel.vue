<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Api } from '@/lib/api'
import AdminAccountPanel from './AdminAccountPanel.vue'
import AdminApiKeysPanel from './AdminApiKeysPanel.vue'
import AdminPasskeysPanel from './AdminPasskeysPanel.vue'
import AdminTotpPanel from './AdminTotpPanel.vue'

const requireTwoFactor = ref(false)

onMounted(async () => {
  requireTwoFactor.value = await Api.publicSettings()
    .then((settings) => settings.requireTwoFactor)
    .catch(() => false)
})
</script>

<template>
  <section>
	    <h2 class="text-lg font-semibold mb-3">Account security</h2>
	    <div class="card p-4 max-w-xl space-y-4">
	      <p v-if="requireTwoFactor" class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
	        Two-factor authentication is required by site policy.
	      </p>
      <AdminAccountPanel />
      <AdminTotpPanel />
      <AdminPasskeysPanel />
      <AdminApiKeysPanel />
    </div>
  </section>
</template>
