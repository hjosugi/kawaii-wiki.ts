import type { User } from '../db/schema.ts'
import type { AssetView } from '../services/assets.ts'
import type { CommentView } from '../services/comments.ts'
export { pageSnapshot, parsePageLabels } from '../services/page-view.ts'

export const publicUser = (
  user: Pick<User, 'id' | 'email' | 'name' | 'role'> & {
    readonly totpEnabled?: boolean | number | null
    readonly totpSecret?: string | null
  },
) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  totpEnabled: Boolean(user.totpEnabled),
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
