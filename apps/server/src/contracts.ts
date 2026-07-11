/** Plain response/view-model contracts shared with the browser client. */
export type { Page } from './db/schema.ts'
export type {
  PageSummary,
  PageSpace,
  PageGraphNode,
  PageGraphEdge,
  PageGraph,
  PageBacklink,
  LabelCount,
  BrokenLink,
  RecentChange,
  PageRedirectView,
  PageRevisionSummary,
  PageInsightContributor,
} from './services/pages.ts'
export type {
  SearchHit,
  SearchResponse,
  SearchScope,
  SearchSort,
  SearchTokenizerHint,
  SearchShortQueryHint,
  SearchIndexStatus,
} from './services/search.ts'
export type { AssetView, AssetUsagePage, AssetUsageView } from './services/assets.ts'
export type { CommentView } from './services/comments.ts'
export type { PageShareView, SharedPage } from './services/shares.ts'
export type { PageTemplateMetadata, PageTemplateView } from './services/templates.ts'
export type {
  AdminUserView,
  AdminStats,
  AdminHistoryStats,
  PurgeHistoryResult,
  AdminPageView,
  AdminPageList,
  AdminAuditEvent,
  AdminAuditList,
} from './services/admin.ts'
export type { AuthzGroupView } from './services/authz.ts'
export type { ApiKeyView } from './services/api-keys.ts'
export type {
  WebhookSubscriptionView,
  WebhookDeliveryView,
  AutomationRuleView,
} from './services/webhooks.ts'
export type { AnalyticsSummary, PageInsight } from './services/analytics.ts'
export type { NotificationView, NotificationList } from './services/notifications.ts'
export type { GitStatus } from './storage/git.ts'
