import type { AssetUsage, AssetView } from './api'

export const attachmentsForPage = (usage: AssetUsage[], pagePath: string): AssetView[] =>
  usage
    .filter((entry) => entry.pages.some((usedOn) => usedOn.path === pagePath))
    .map((entry) => entry.asset)
