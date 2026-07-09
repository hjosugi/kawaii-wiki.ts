import { t } from '@/lib/i18n'

export interface FriendlyErrorInput {
  readonly kind?: string
  readonly status?: number
  readonly message?: string
  readonly field?: string
}

const details = (message?: string): string =>
  message ? ` ${t('errorDetails', { details: message })}` : ''

export const friendlyErrorMessage = (error: FriendlyErrorInput): string => {
  if (error.kind === 'validation' || error.status === 422) {
    return `${t('errorValidation')}${details(error.message)}`
  }
  if (error.kind === 'unauthorized' || error.status === 401) return t('errorUnauthorized')
  if (error.kind === 'forbidden' || error.status === 403) return t('errorForbidden')
  if (error.kind === 'not_found' || error.status === 404) return t('errorNotFound')
  if (error.kind === 'conflict' || error.status === 409) return t('errorConflict')
  if (error.kind === 'rate_limited' || error.status === 429) return t('errorRateLimited')
  if (error.kind === 'internal' || (error.status ?? 0) >= 500) return t('errorInternal')
  return `${t('errorUnknown')}${details(error.message)}`
}

export const friendlyError = (error: unknown): string =>
  error instanceof Error
    ? error.message || friendlyErrorMessage({})
    : friendlyErrorMessage({ message: String(error ?? '') })
