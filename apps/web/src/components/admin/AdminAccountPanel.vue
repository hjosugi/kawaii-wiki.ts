<script setup lang="ts">
import { ref } from 'vue'
import { Api, type ProfileLink } from '@/lib/api'
import { useAuth } from '@/stores/auth'

const auth = useAuth()
const name = ref(auth.user?.name ?? '')
const bio = ref(auth.user?.profileBio ?? '')
const coverUrl = ref(auth.user?.profileCoverUrl ?? '')
const links = ref<ProfileLink[]>(auth.user?.profileLinks.length ? [...auth.user.profileLinks] : [{ label: 'YouTube', url: '' }])
const favoritePagesText = ref((auth.user?.profileFavoritePages ?? []).join('\n'))
const currentPassword = ref('')
const newPassword = ref('')
const busy = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

async function saveProfile(): Promise<void> {
  busy.value = true
  message.value = null
  error.value = null
  try {
    auth.user = await Api.updateProfile({
      name: name.value,
      bio: bio.value,
      coverUrl: coverUrl.value,
      links: links.value.filter((link) => link.url.trim()),
      favoritePages: favoritePagesText.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
    })
    name.value = auth.user.name
    bio.value = auth.user.profileBio
    coverUrl.value = auth.user.profileCoverUrl
    links.value = auth.user.profileLinks.length ? [...auth.user.profileLinks] : [{ label: 'YouTube', url: '' }]
    favoritePagesText.value = auth.user.profileFavoritePages.join('\n')
    message.value = 'Profile updated'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function savePassword(): Promise<void> {
  busy.value = true
  message.value = null
  error.value = null
  try {
    auth.user = await Api.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    message.value = 'Password updated'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function addLink(): void {
  links.value.push({ label: '', url: '' })
}

function removeLink(index: number): void {
  links.value.splice(index, 1)
  if (!links.value.length) addLink()
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="font-medium">Profile</h3>
        <p class="text-sm text-gray-500">{{ auth.user?.email }}</p>
      </div>
      <button class="btn-ghost" type="button" :disabled="busy || !name.trim()" @click="saveProfile">Save</button>
    </div>
    <input v-model="name" class="input" placeholder="Display name" aria-label="Display name" />
    <textarea v-model="bio" class="input min-h-28" maxlength="2000" placeholder="Profile bio (Markdown)" aria-label="Profile bio"></textarea>
    <input v-model="coverUrl" class="input" placeholder="Cover image URL" aria-label="Cover image URL" />

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <h4 class="text-sm font-medium">Profile links</h4>
        <button class="btn-ghost py-1 text-xs" type="button" @click="addLink">Add link</button>
      </div>
      <div v-for="(link, index) in links" :key="index" class="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]">
        <input v-model="link.label" class="input" placeholder="Label" :aria-label="`Link ${index + 1} label`" />
        <input v-model="link.url" class="input" placeholder="https://..." :aria-label="`Link ${index + 1} URL`" />
        <button class="btn-ghost" type="button" @click="removeLink(index)">Remove</button>
      </div>
    </div>

    <textarea
      v-model="favoritePagesText"
      class="input min-h-20 font-mono text-sm"
      placeholder="Featured page paths, one per line"
      aria-label="Featured page paths"
    ></textarea>
    <RouterLink v-if="auth.user" class="btn-ghost w-fit" :to="{ name: 'user-profile', params: { id: auth.user.id } }">
      View public profile
    </RouterLink>

    <div class="grid sm:grid-cols-2 gap-2">
      <input v-model="currentPassword" class="input" type="password" placeholder="Current password" aria-label="Current password" autocomplete="current-password" />
      <input v-model="newPassword" class="input" type="password" placeholder="New password" aria-label="New password" autocomplete="new-password" />
    </div>
    <button
      class="btn-primary"
      type="button"
      :disabled="busy || !currentPassword || newPassword.length < 6"
      @click="savePassword"
    >
      Change password
    </button>
    <p v-if="message" class="text-sm text-emerald-600">{{ message }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
  </div>
</template>
