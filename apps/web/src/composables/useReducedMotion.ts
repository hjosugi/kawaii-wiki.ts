import { onBeforeUnmount, ref } from 'vue'

const query = '(prefers-reduced-motion: reduce)'

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches)

export const useReducedMotion = () => {
  const reducedMotion = ref(false)

  if (typeof window === 'undefined' || !window.matchMedia) return reducedMotion

  const media = window.matchMedia(query)
  const update = (): void => {
    reducedMotion.value = media.matches
  }
  update()
  media.addEventListener('change', update)
  onBeforeUnmount(() => media.removeEventListener('change', update))

  return reducedMotion
}
