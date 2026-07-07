import type { AssetUsage, AssetView } from './api'

export const attachmentsForPage = (usage: AssetUsage[], pagePath: string): AssetView[] =>
  usage
    .filter((entry) => entry.pages.some((usedOn) => usedOn.path === pagePath))
    .map((entry) => entry.asset)

export const assetFolderFromPagePath = (pagePath: string): string => {
  const normalized = pagePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const segments = normalized.split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}

export const displayAssetFolder = (folder: string): string => folder ? `${folder}/` : 'Root'
