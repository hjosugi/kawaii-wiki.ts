export type LinkPreviewKind = 'unfurl' | 'youtube-latest'

export interface LinkPreviewRecord {
  readonly url: string
  readonly kind: LinkPreviewKind
  readonly provider: string
  readonly title: string
  readonly description: string
  readonly image: string | null
  readonly author: string | null
  readonly siteName: string | null
  readonly contentType: string | null
  readonly data: string
  readonly fetchedAt: number
  readonly expiresAt: number
}

export interface LinkPreviewRepository {
  findByUrl(url: string): Promise<LinkPreviewRecord | undefined>
  upsert(preview: LinkPreviewRecord): Promise<void>
}
