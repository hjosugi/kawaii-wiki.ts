import type { User } from '../db/schema.ts'
import type { AssetView } from '../services/assets.ts'
import type { CommentView } from '../services/comments.ts'
export { pageSnapshot, parsePageLabels } from '../services/page-view.ts'

export interface PublicProfileLink {
  readonly label: string
  readonly url: string
}

const parseJsonArray = (value: string): unknown[] => {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const parseUserProfileLinks = (value: string): PublicProfileLink[] =>
  parseJsonArray(value)
    .filter((item): item is PublicProfileLink =>
      Boolean(
        item
        && typeof item === 'object'
        && typeof (item as PublicProfileLink).label === 'string'
        && typeof (item as PublicProfileLink).url === 'string',
      ),
    )
    .map((item) => ({ label: item.label, url: item.url }))

export const parseUserFavoritePages = (value: string): string[] =>
  parseJsonArray(value).filter((item): item is string => typeof item === 'string')

export const publicUser = (
  user: Pick<User, 'id' | 'email' | 'name' | 'role'> & {
    readonly totpEnabled?: boolean | number | null
    readonly totpSecret?: string | null
    readonly profileBio?: string | null
    readonly profileCoverUrl?: string | null
    readonly profileLinks?: string | null
    readonly profileFavoritePages?: string | null
  },
) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  totpEnabled: Boolean(user.totpEnabled),
  profileBio: user.profileBio ?? '',
  profileCoverUrl: user.profileCoverUrl ?? '',
  profileLinks: parseUserProfileLinks(user.profileLinks ?? '[]'),
  profileFavoritePages: parseUserFavoritePages(user.profileFavoritePages ?? '[]'),
})

export const publicUserProfile = (
  user: Pick<User, 'id' | 'name' | 'role' | 'profileBio' | 'profileCoverUrl' | 'profileLinks' | 'profileFavoritePages' | 'createdAt'>,
) => ({
  id: user.id,
  name: user.name,
  role: user.role,
  profileBio: user.profileBio,
  profileCoverUrl: user.profileCoverUrl,
  profileLinks: parseUserProfileLinks(user.profileLinks),
  profileFavoritePages: parseUserFavoritePages(user.profileFavoritePages),
  createdAt: user.createdAt,
})

export const commentSnapshot = (comment: CommentView) => ({
  id: comment.id,
  path: comment.path,
  authorId: comment.authorId,
  mentions: comment.mentions,
  resolvedAt: comment.resolvedAt,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
})

export const assetSnapshot = (asset: AssetView) => ({
  id: asset.id,
  filename: asset.filename,
  storageName: asset.storageName,
  folder: asset.folder,
  mime: asset.mime,
  size: asset.size,
  url: asset.url,
  thumbUrl: asset.thumbUrl,
  authorId: asset.authorId,
  createdAt: asset.createdAt,
  deletedAt: asset.deletedAt,
})
