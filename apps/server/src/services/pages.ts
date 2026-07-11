/**
 * Page service — the core write path. Every mutation:
 *   1. checks permission (pure `can()` from @kawaii-wiki/core),
 *   2. validates & normalises input (pure `validatePageInput`),
 *   3. renders Markdown → HTML + TOC (pure `renderMarkdown`),
 *   4. persists page + revision + FTS index in ONE transaction.
 *
 * Contrast Wiki.js: render is fire-and-forget there, so fresh pages flash blank
 * and aren't searchable; storage writes aren't transactional. Here a save is
 * atomic and the page is fully rendered and indexed the instant it returns.
 */
import {
  type Result,
  ok,
  err,
  type AppError,
  type Principal,
  type PageInput,
  notFound,
  conflict,
  validationError,
  validatePageInput,
  renderMarkdown,
  type RenderResult,
  extractPageLinks,
  rewritePageLinks,
  extractCalendarEvents,
  normalizePath,
  normalizeLabels,
  parseJsonStringArray,
  requirePermission,
  isPageStatus,
  normalizeLocale,
  type PageStatus,
  type PageFileData,
  type ExtractedCalendarEvent,
  contentWithTocFrontmatter,
} from '@kawaii-wiki/core'
import {
  DuplicatePagePathError,
  type PageLifecycle,
  type PageReadRepository,
  type PageRecord,
  type PageRevisionRecord,
  type PageWriteRepository,
  type RewrittenPageWrite,
} from '../repositories/pages.ts'

export interface PageSummary {
  readonly path: string
  readonly title: string
  readonly description: string
  readonly icon: string
  readonly coverUrl: string
  readonly coverPosition: string
  readonly lifecycle: PageLifecycle
  readonly status: PageStatus
  readonly labels: string
  readonly ownerId: string | null
  readonly authorId: string | null
  readonly reviewAt: number | null
  readonly publishAt: number | null
  readonly navOrder: number | null
  readonly pinned: boolean
  readonly spaceKey: string
  readonly locale: string
  readonly updatedAt: number
}

export interface PageSpace {
  readonly key: string
  readonly pages: number
  readonly updatedAt: number
}

export interface PageGraphNode {
  readonly path: string
  readonly title: string
  readonly kind: 'page' | 'missing'
}

export interface PageGraphEdge {
  readonly source: string
  readonly target: string
  readonly kind: 'wikilink' | 'markdown'
}

export interface PageGraph {
  readonly nodes: PageGraphNode[]
  readonly edges: PageGraphEdge[]
}

export interface PageBacklink {
  readonly path: string
  readonly title: string
  readonly label: string
  readonly kind: 'wikilink' | 'markdown'
}

export interface LabelCount {
  readonly label: string
  readonly count: number
}

export interface BrokenLink {
  readonly path: string
  readonly title: string
  readonly target: string
  readonly label: string
  readonly kind: 'wikilink' | 'markdown'
}

export interface RecentChange {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly action: PageRevisionRecord['action']
  readonly authorId: string | null
  readonly authorName: string | null
  readonly createdAt: number
}

export interface PageRedirectView {
  readonly fromPath: string
  readonly toPath: string
  readonly createdAt: number
}

export interface PageRevisionSummary {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly description: string
  readonly content: string
  readonly authorId: string | null
  /** Display name of the author, or null if unknown/deleted. */
  readonly authorName: string | null
  readonly action: PageRevisionRecord['action']
  readonly createdAt: number
}

export interface PageInsightContributor {
  readonly authorId: string | null
  readonly authorName: string
  readonly revisions: number
  readonly lastContributionAt: number
}

export interface PageRevisionInsight {
  readonly revisionCount: number
  readonly contributors: PageInsightContributor[]
}

export interface ResolvedPage {
  readonly page: PageRecord
  readonly redirectedFrom: readonly string[]
}

export interface UpdatePagePatch {
  readonly title?: string
  readonly content?: string
  readonly description?: string
  readonly icon?: string
  readonly coverUrl?: string
  readonly coverPosition?: string
  readonly labels?: readonly string[]
  readonly status?: PageStatus
  readonly ownerId?: string | null
  readonly reviewAt?: number | null
  readonly publishAt?: number | null
  readonly locale?: string | null
  readonly navOrder?: number | null
  readonly pinned?: boolean
  readonly expectedUpdatedAt?: number | null
}

export interface UpsertPageFileOptions {
  readonly title?: string
  readonly description?: string
  readonly icon?: string
  readonly coverUrl?: string
  readonly coverPosition?: string
  readonly labels?: readonly string[]
  readonly status?: PageStatus
  readonly locale?: string | null
  readonly navOrder?: number | null
  readonly pinned?: boolean
}

export interface UpsertPageFileResult {
  readonly page: PageRecord
  readonly created: boolean
  readonly previous?: PageRecord
}

export interface PageService {
  list(): Promise<PageSummary[]>
  allActive(): Promise<PageRecord[]>
  trash(): Promise<PageSummary[]>
  spaces(): Promise<PageSpace[]>
  graph(): Promise<PageGraph>
  backlinks(path: string): Promise<PageBacklink[]>
  labels(): Promise<LabelCount[]>
  brokenLinks(): Promise<BrokenLink[]>
  recentChanges(limit?: number, before?: number | null, canRead?: (path: string) => boolean): Promise<RecentChange[]>
  redirects(principal: Principal | null): Promise<Result<PageRedirectView[], AppError>>
  createRedirect(fromPath: string, toPath: string, principal: Principal | null): Promise<Result<PageRedirectView, AppError>>
  deleteRedirect(fromPath: string, principal: Principal | null): Promise<Result<{ fromPath: string }, AppError>>
  events(): Promise<ExtractedCalendarEvent[]>
  history(path: string): Promise<Result<PageRevisionSummary[], AppError>>
  revisionInsights(path: string): Promise<Result<PageRevisionInsight, AppError>>
  getByPath(path: string): Promise<Result<PageRecord, AppError>>
  resolveByPath(path: string): Promise<Result<ResolvedPage, AppError>>
  create(input: PageInput, principal: Principal | null): Promise<Result<PageRecord, AppError>>
  copy(fromPath: string, newPath: string, principal: Principal | null, keepStatus?: boolean): Promise<Result<PageRecord, AppError>>
  update(path: string, patch: UpdatePagePatch, principal: Principal | null): Promise<Result<PageRecord, AppError>>
  upsertFromFile(
    path: string,
    file: PageFileData,
    options: UpsertPageFileOptions,
    principal: Principal | null,
  ): Promise<Result<UpsertPageFileResult, AppError>>
  /** Lightweight content save (no revision) — used by collaborative autosave. */
  saveContent(
    path: string,
    content: string,
    principal: Principal | null,
    expectedUpdatedAt?: number | null,
  ): Promise<Result<PageRecord, AppError>>
  restoreRevision(path: string, revisionId: string, principal: Principal | null): Promise<Result<PageRecord, AppError>>
  archive(path: string, principal: Principal | null): Promise<Result<PageRecord, AppError>>
  restore(path: string, principal: Principal | null): Promise<Result<PageRecord, AppError>>
  move(oldPath: string, newPath: string, principal: Principal | null): Promise<Result<PageRecord, AppError>>
  remove(path: string, principal: Principal | null): Promise<Result<{ path: string }, AppError>>
  purge(path: string, principal: Principal | null): Promise<Result<{ path: string }, AppError>>
}

export interface PageServiceOptions {
  readonly renderMarkdown?: (content: string) => RenderResult
  readonly defaultLocale?: () => string
}

export const createPageService = (
  pageReads: PageReadRepository,
  pageWrites: PageWriteRepository,
  options: PageServiceOptions = {},
): PageService => {
  const renderPageMarkdown = options.renderMarkdown ?? renderMarkdown
  const defaultLocale = options.defaultLocale ?? (() => 'und')
  let derivedVersion = 0
  const touchDerived = (): void => { derivedVersion += 1 }

  interface DerivedPageData {
    readonly path: string
    readonly title: string
    readonly links: ReturnType<typeof extractPageLinks>
    readonly events: ExtractedCalendarEvent[]
  }
  let derivedCache: { signature: string; pages: DerivedPageData[] } | null = null
  const derivedPages = async (): Promise<DerivedPageData[]> => {
    const activePages = await pageReads.listActive()
    const latest = activePages.reduce((value, page) => Math.max(value, page.updatedAt), 0)
    const total = activePages.reduce((value, page) => value + page.updatedAt, 0)
    const signature = `${derivedVersion}:${activePages.length}:${latest}:${total}`
    if (derivedCache?.signature === signature) return derivedCache.pages
    const indexed = activePages.map((page) => ({
        path: page.path,
        title: page.title,
        links: extractPageLinks(page.content),
        events: extractCalendarEvents(page.content, page.path),
      }))
    derivedCache = { signature, pages: indexed }
    return indexed
  }

  const findByPath = (path: string): Promise<PageRecord | undefined> =>
    pageWrites.findByPath(normalizePath(path))

  const findRedirect = (path: string): Promise<string | null> =>
    pageWrites.findRedirect(normalizePath(path))

  const requirePagePermission = (
    principal: Principal | null,
    action: Parameters<typeof requirePermission>[1],
    path?: string,
  ): Result<true, AppError> => requirePermission(principal, action, path ? { path } : {})

  const resolvePath = async (path: string): Promise<Result<ResolvedPage, AppError>> => {
    let currentPath = normalizePath(path)
    const redirectedFrom: string[] = []
    const seen = new Set<string>()

    for (let hop = 0; hop < 10; hop += 1) {
      if (seen.has(currentPath)) return err(conflict(`Redirect loop detected for "${path}"`))
      seen.add(currentPath)
      const page = await findByPath(currentPath)
      if (page?.lifecycle === 'active') return ok({ page, redirectedFrom })

      const nextPath = await findRedirect(currentPath)
      if (!nextPath) return err(notFound(`No page at "${path}"`))
      redirectedFrom.push(currentPath)
      currentPath = normalizePath(nextPath)
    }

    return err(conflict(`Redirect chain is too long for "${path}"`))
  }

  const tombstoneConflict = (path: string): AppError =>
    conflict(`A deleted page exists here at "${normalizePath(path)}"; restore it from Trash or purge it first.`)

  const pathConflict = (page: PageRecord, path: string): AppError =>
    page.lifecycle === 'active' ? conflict(`A page already exists at "${normalizePath(path)}"`) : tombstoneConflict(path)

  const parseLabels = (value: string): string[] => normalizeLabels(parseJsonStringArray(value))

  const revisionFor = (
    page: Pick<PageRecord, 'id' | 'path' | 'title' | 'description' | 'content'>,
    principal: Principal | null,
    action: PageRevisionRecord['action'],
    now: number,
  ): PageRevisionRecord => ({
    id: crypto.randomUUID(), pageId: page.id, path: page.path, title: page.title,
    description: page.description, content: page.content, authorId: principal?.id ?? null,
    action, createdAt: now,
  })

  const writeExistingPage = async (
    current: PageRecord,
    next: {
      title: string
      description: string
      content: string
      icon: string
      coverUrl: string
      coverPosition: string
      labels: readonly string[]
      status: PageStatus
      ownerId: string | null
      reviewAt: number | null
      publishAt: number | null
      locale: string
      navOrder: number | null
      pinned: boolean
    },
    principal: Principal | null,
    revisionAction: 'updated' | null,
  ): Promise<PageRecord | undefined> => {
    const { html, toc } = renderPageMarkdown(next.content)
    const now = Date.now()

    const page = await pageWrites.writeExisting({
      pageId: current.id,
      revision: revisionAction ? revisionFor(current, principal, revisionAction, now) : null,
      changes: {
          title: next.title,
          description: next.description,
          content: next.content,
          icon: next.icon,
          coverUrl: next.coverUrl,
          coverPosition: next.coverPosition,
          renderedHtml: html,
          toc: JSON.stringify(toc),
          labels: JSON.stringify(next.labels),
          status: next.status,
          ownerId: next.ownerId,
          reviewAt: next.reviewAt,
          publishAt: next.publishAt,
          locale: next.locale,
          navOrder: next.navOrder,
          pinned: next.pinned,
          updatedAt: now,
      },
    })
    if (page) touchDerived()
    return page
  }

  return {
    async allActive() {
      return await pageReads.listActive()
    },

    async list() {
      return await pageReads.listActive()
    },

    async trash() {
      return await pageReads.listInactive()
    },

    async spaces() {
      const spaces = new Map<string, PageSpace>()
      for (const page of await pageReads.listActive()) {
        const current = spaces.get(page.spaceKey)
        spaces.set(page.spaceKey, {
          key: page.spaceKey,
          pages: (current?.pages ?? 0) + 1,
          updatedAt: Math.max(current?.updatedAt ?? 0, page.updatedAt),
        })
      }
      return [...spaces.values()].sort((a, b) => a.key.localeCompare(b.key))
    },

    async graph() {
      const allPages = await derivedPages()
      const existing = new Map(allPages.map((page) => [page.path, page]))
      const missing = new Set<string>()
      const edgeKeys = new Set<string>()
      const edges: PageGraphEdge[] = []

      for (const page of allPages) {
        for (const link of page.links) {
          if (link.path === page.path) continue
          if (!existing.has(link.path)) missing.add(link.path)
          const key = `${page.path}\u0000${link.path}\u0000${link.kind}`
          if (edgeKeys.has(key)) continue
          edgeKeys.add(key)
          edges.push({ source: page.path, target: link.path, kind: link.kind })
        }
      }

      const nodes: PageGraphNode[] = [
        ...allPages.map((page) => ({ path: page.path, title: page.title, kind: 'page' as const })),
        ...[...missing]
          .sort()
          .map((path) => ({ path, title: path.split('/').at(-1) ?? path, kind: 'missing' as const })),
      ]

      return { nodes, edges }
    },

    async backlinks(path) {
      const target = normalizePath(path)
      const out: PageBacklink[] = []
      const seen = new Set<string>()
      for (const page of await derivedPages()) {
        for (const link of page.links) {
          if (link.path !== target) continue
          const key = `${page.path}\u0000${link.kind}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ path: page.path, title: page.title, label: link.label, kind: link.kind })
        }
      }
      return out
    },

    async labels() {
      const counts = new Map<string, number>()
      for (const page of await pageReads.listActive()) {
        for (const label of parseLabels(page.labels)) {
          counts.set(label, (counts.get(label) ?? 0) + 1)
        }
      }
      return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    },

    async brokenLinks() {
      const allPages = await derivedPages()
      const existing = new Set(allPages.map((page) => page.path))
      const out: BrokenLink[] = []
      const seen = new Set<string>()
      for (const page of allPages) {
        for (const link of page.links) {
          if (link.path === page.path || existing.has(link.path)) continue
          const key = `${page.path}\u0000${link.path}\u0000${link.kind}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ path: page.path, title: page.title, target: link.path, label: link.label, kind: link.kind })
        }
      }
      return out
    },

    async recentChanges(limit = 50, before = null, canRead) {
      const capped = Math.min(Math.max(limit, 1), 200)
      const readable: RecentChange[] = []
      const batchSize = Math.min(Math.max(capped * 3, 50), 500)
      let cursor = before ?? null
      for (let batch = 0; batch < 20 && readable.length < capped; batch += 1) {
        const rows = await pageReads.listRecentRevisions(cursor, batchSize)
        if (!rows.length) break
        for (const row of rows) {
          if (!canRead || canRead(row.path)) readable.push({ ...row, authorName: row.authorName ?? null })
          if (readable.length === capped) break
        }
        if (rows.length < batchSize) break
        cursor = rows.at(-1)?.createdAt ?? null
      }
      return readable
    },

    async redirects(principal) {
      const allowed = requirePagePermission(principal, 'page:update')
      if (!allowed.ok) return allowed
      return ok(await pageReads.listRedirects())
    },

    async createRedirect(fromPath, toPath, principal) {
      const from = normalizePath(fromPath)
      const to = normalizePath(toPath)
      const allowed = requirePagePermission(principal, 'page:update', to)
      if (!allowed.ok) return allowed
      if (!from || !to) return err(validationError('Redirect paths are required', 'fromPath'))
      if (from === to) return err(conflict('Redirect source and target must be different'))
      const sourcePage = await findByPath(from)
      if (sourcePage?.lifecycle === 'active') return err(conflict(`A page already exists at "${from}"`))
      const existing = await findRedirect(from)
      if (existing) return err(conflict(`A redirect already exists at "${from}"`))
      const resolved = await resolvePath(to)
      if (!resolved.ok) return resolved
      const target = resolved.value.page.path
      if (target === from) return err(conflict('Redirect would create a loop'))
      const redirect = { fromPath: from, toPath: target, createdAt: Date.now() }
      await pageWrites.createRedirect(redirect)
      return ok(redirect)
    },

    async deleteRedirect(fromPath, principal) {
      const from = normalizePath(fromPath)
      const allowed = requirePagePermission(principal, 'page:update', from)
      if (!allowed.ok) return allowed
      const existing = await findRedirect(from)
      if (!existing) return err(notFound(`No redirect at "${from}"`))
      await pageWrites.deleteRedirect(from)
      return ok({ fromPath: from })
    },

    async events() {
      return (await derivedPages())
        .flatMap((page) => page.events)
        .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
    },

    async history(path) {
      const page = await findByPath(path)
      if (!page) return err(notFound(`No page at "${path}"`))
      return ok(await pageReads.listRevisions(page.id) as PageRevisionSummary[])
    },

    async revisionInsights(path) {
      const page = await findByPath(path)
      if (page?.lifecycle !== 'active') return err(notFound(`No page at "${path}"`))
      const revisions = await pageReads.listRevisions(page.id)
      const contributors = (await pageReads.revisionContributors(page.id)).map((row) => ({
          authorId: row.authorId,
          authorName: row.authorName ?? (row.authorId ? 'Unknown user' : 'Unknown'),
          revisions: row.revisions,
          lastContributionAt: row.lastContributionAt,
        }))
      return ok({ revisionCount: revisions.length, contributors })
    },

    async getByPath(path) {
      const page = await findByPath(path)
      if (page?.lifecycle !== 'active') return err(notFound(`No page at "${path}"`))
      return ok(page)
    },

    async resolveByPath(path) {
      return await resolvePath(path)
    },

    async create(input, principal) {
      const validated = validatePageInput({ ...input, locale: input.locale ?? defaultLocale() })
      if (!validated.ok) return validated
      const v = validated.value
      const allowed = requirePagePermission(principal, 'page:create', v.path)
      if (!allowed.ok) return allowed

      const existing = await findByPath(v.path)
      if (existing) return err(pathConflict(existing, v.path))

      const { html, toc } = renderPageMarkdown(v.content)
      const now = Date.now()
      const id = crypto.randomUUID()

      const candidate: PageRecord = {
        id,
        path: v.path,
        title: v.title,
        description: v.description,
        content: v.content,
        icon: v.icon,
        coverUrl: v.coverUrl,
        coverPosition: v.coverPosition,
        renderedHtml: html,
        toc: JSON.stringify(toc),
        contentType: 'markdown',
        lifecycle: 'active',
        labels: JSON.stringify(v.labels),
        status: v.status,
        ownerId: v.ownerId,
        reviewAt: v.reviewAt,
        publishAt: v.publishAt,
        navOrder: v.navOrder,
        pinned: v.pinned,
        spaceKey: v.path.split('/')[0] || 'main',
        locale: v.locale,
        authorId: principal?.id ?? null,
        createdAt: now,
        updatedAt: now,
      }
      let page: PageRecord | undefined
      try {
        page = await pageWrites.create(candidate, revisionFor(candidate, principal, 'created', now))
      } catch (error) {
        if (error instanceof DuplicatePagePathError) return err(conflict(`A page already exists at "${v.path}"`))
        throw error
      }
      if (page) touchDerived()
      return page ? ok(page) : err(notFound('Page disappeared while it was being created'))
    },

    async copy(fromPath, newPath, principal, keepStatus = false) {
      const source = await findByPath(fromPath)
      if (!source || source.lifecycle !== 'active') return err(notFound(`No page at "${fromPath}"`))
      const readable = requirePagePermission(principal, 'page:read', source.path)
      if (!readable.ok) return readable
      return await this.create({
        path: newPath,
        title: `${source.title} (copy)`,
        content: source.content,
        description: source.description,
        icon: source.icon,
        coverUrl: source.coverUrl,
        coverPosition: source.coverPosition,
        labels: parseLabels(source.labels),
        status: keepStatus && isPageStatus(source.status) ? source.status : 'draft',
        ownerId: principal?.id ?? source.ownerId,
        reviewAt: null,
        publishAt: null,
        locale: source.locale,
      }, principal)
    },

    async update(path, patch, principal) {
      const current = await findByPath(path)
      if (!current || current.lifecycle !== 'active') return err(notFound(`No page at "${path}"`))
      const allowed = requirePagePermission(principal, 'page:update', current.path)
      if (!allowed.ok) return allowed
      if (patch.expectedUpdatedAt != null && current.updatedAt !== patch.expectedUpdatedAt) {
        return err(conflict(`Page "${path}" changed since you opened it; reload the latest version before saving.`))
      }

      const validated = validatePageInput({
        path: current.path,
        title: patch.title ?? current.title,
        content: patch.content ?? current.content,
        // Leave undefined when not supplied so the summary is re-derived from
        // the new content rather than carrying a stale auto-description forward.
        description: patch.description,
        icon: patch.icon ?? current.icon,
        coverUrl: patch.coverUrl ?? current.coverUrl,
        coverPosition: patch.coverPosition ?? current.coverPosition,
        labels: patch.labels ?? parseLabels(current.labels),
        status: patch.status ?? current.status,
        ownerId: patch.ownerId === undefined ? current.ownerId : patch.ownerId,
        reviewAt: patch.reviewAt === undefined ? current.reviewAt : patch.reviewAt,
        publishAt: patch.publishAt === undefined ? current.publishAt : patch.publishAt,
        locale: patch.locale ?? current.locale,
        navOrder: patch.navOrder === undefined ? current.navOrder : patch.navOrder,
        pinned: patch.pinned ?? current.pinned,
      })
      if (!validated.ok) return validated
      const v = validated.value

      const page = await writeExistingPage(current, v, principal, 'updated')
      return page ? ok(page) : err(notFound(`Page "${path}" disappeared while it was being updated`))
    },

    async upsertFromFile(path, file, options, principal) {
      const title = (options.title ?? file.title).trim() || normalizePath(path).split('/').at(-1) || 'Imported page'
      const description = options.description ?? file.description
      const content = contentWithTocFrontmatter(file)
      const existing = await this.getByPath(path)
      if (existing.ok) {
        const page = await this.update(path, {
          title,
          description,
          content,
          icon: options.icon ?? file.icon,
          coverUrl: options.coverUrl ?? file.coverUrl,
          coverPosition: options.coverPosition ?? file.coverPosition,
          labels: options.labels,
          status: options.status,
          locale: options.locale,
          navOrder: options.navOrder,
          pinned: options.pinned,
        }, principal)
        if (!page.ok) return page
        return ok({ page: page.value, created: false, previous: existing.value })
      }

      const page = await this.create({
        path,
        title,
        description,
        content,
        icon: options.icon ?? file.icon,
        coverUrl: options.coverUrl ?? file.coverUrl,
        coverPosition: options.coverPosition ?? file.coverPosition,
        labels: options.labels,
        status: options.status,
        locale: options.locale,
        navOrder: options.navOrder,
        pinned: options.pinned,
      }, principal)
      if (!page.ok) return page
      return ok({ page: page.value, created: true })
    },

    async saveContent(path, content, principal, expectedUpdatedAt = null) {
      const current = await findByPath(path)
      if (!current || current.lifecycle !== 'active') return err(notFound(`No page at "${path}"`))
      const allowed = requirePagePermission(principal, 'page:update', current.path)
      if (!allowed.ok) return allowed
      if (expectedUpdatedAt !== null && current.updatedAt !== expectedUpdatedAt) {
        return err(conflict(`Page "${path}" changed outside the collaborative editor`))
      }

      const validated = validatePageInput({
        path: current.path,
        title: current.title,
        content,
        labels: parseLabels(current.labels),
        icon: current.icon,
        coverUrl: current.coverUrl,
        coverPosition: current.coverPosition,
        status: isPageStatus(current.status) ? current.status : 'draft',
        ownerId: current.ownerId,
        reviewAt: current.reviewAt,
        publishAt: current.publishAt,
        locale: current.locale,
        navOrder: current.navOrder,
        pinned: current.pinned,
      })
      if (!validated.ok) return validated

      // Lightweight save for collaborative autosave: refresh content + render +
      // search index WITHOUT snapshotting a revision (explicit Save does that).
      const page = await writeExistingPage(
        current,
        validated.value,
        principal,
        null,
      )
      return page ? ok(page) : err(notFound(`Page "${path}" disappeared while it was being saved`))
    },

    async restoreRevision(path, revisionId, principal) {
      const current = await findByPath(path)
      if (!current || current.lifecycle !== 'active') return err(notFound(`No page at "${path}"`))
      const allowed = requirePagePermission(principal, 'page:update', current.path)
      if (!allowed.ok) return allowed
      const revision = await pageWrites.findRevision(revisionId)
      if (!revision || revision.pageId !== current.id) return err(notFound('Revision not found'))

      const page = await writeExistingPage(
        current,
        {
          title: revision.title,
          description: revision.description,
          content: revision.content,
          labels: parseLabels(current.labels),
          icon: current.icon,
          coverUrl: current.coverUrl,
          coverPosition: current.coverPosition,
          status: isPageStatus(current.status) ? current.status : 'draft',
          ownerId: current.ownerId,
          reviewAt: current.reviewAt,
          publishAt: current.publishAt,
          locale: normalizeLocale(current.locale),
          navOrder: current.navOrder,
          pinned: current.pinned,
        },
        principal,
        'updated',
      )
      return page ? ok(page) : err(notFound(`Page "${path}" disappeared while its revision was being restored`))
    },

    async archive(path, principal) {
      const current = await findByPath(path)
      if (!current || current.lifecycle !== 'active') return err(notFound(`No page at "${path}"`))
      const allowed = requirePagePermission(principal, 'page:delete', current.path)
      if (!allowed.ok) return allowed
      const now = Date.now()
      const page = await pageWrites.setLifecycle({
        pageId: current.id,
        lifecycle: 'archived',
        updatedAt: now,
        revision: revisionFor(current, principal, 'archived', now),
        index: false,
      })
      if (page) touchDerived()
      return page ? ok(page) : err(notFound(`Page "${path}" disappeared while it was being archived`))
    },

    async restore(path, principal) {
      const current = await findByPath(path)
      if (!current) return err(notFound(`No page at "${path}"`))
      const allowed = requirePagePermission(principal, 'page:update', current.path)
      if (!allowed.ok) return allowed
      if (current.lifecycle === 'active') return ok(current)
      const now = Date.now()
      const page = await pageWrites.setLifecycle({
        pageId: current.id,
        lifecycle: 'active',
        updatedAt: now,
        revision: revisionFor(current, principal, 'restored', now),
        index: true,
      })
      if (page) touchDerived()
      return page ? ok(page) : err(notFound(`Page "${path}" disappeared while it was being restored`))
    },

    async move(oldPath, newPath, principal) {
      const current = await findByPath(oldPath)
      if (!current || current.lifecycle !== 'active') return err(notFound(`No page at "${oldPath}"`))
      const allowed = requirePagePermission(principal, 'page:move', current.path)
      if (!allowed.ok) return allowed

      const validated = validatePageInput({
        path: newPath,
        title: current.title,
        content: current.content,
        description: current.description,
        labels: parseLabels(current.labels),
        icon: current.icon,
        coverUrl: current.coverUrl,
        coverPosition: current.coverPosition,
        status: isPageStatus(current.status) ? current.status : 'draft',
        ownerId: current.ownerId,
        reviewAt: current.reviewAt,
        publishAt: current.publishAt,
        locale: current.locale,
        navOrder: current.navOrder,
        pinned: current.pinned,
      })
      if (!validated.ok) return validated
      const v = validated.value

      if (v.path === current.path) return ok(current)
      const existing = await findByPath(v.path)
      if (existing) return err(pathConflict(existing, v.path))

      const now = Date.now()
      const rewrittenPages: RewrittenPageWrite[] = []
      for (const candidate of await pageReads.listActive()) {
        const content = rewritePageLinks(candidate.content, current.path, v.path)
        if (content === candidate.content) continue
        const rendered = renderPageMarkdown(content)
        rewrittenPages.push({
          pageId: candidate.id,
          content,
          renderedHtml: rendered.html,
          toc: JSON.stringify(rendered.toc),
          updatedAt: now,
          revision: revisionFor(candidate, principal, 'updated', now),
        })
      }
      const page = await pageWrites.move({
        pageId: current.id,
        oldPath: current.path,
        newPath: v.path,
        spaceKey: v.path.split('/')[0] || 'main',
        updatedAt: now,
        revision: revisionFor(current, principal, 'moved', now),
        rewrittenPages,
      })
      if (page) touchDerived()
      return page ? ok(page) : err(notFound(`Page "${oldPath}" disappeared while it was being moved`))
    },

    async remove(path, principal) {
      const current = await findByPath(path)
      if (!current || current.lifecycle !== 'active') return err(notFound(`No page at "${path}"`))
      const allowed = requirePagePermission(principal, 'page:delete', current.path)
      if (!allowed.ok) return allowed

      const now = Date.now()
      const deleted = await pageWrites.remove({
        pageId: current.id,
        path: current.path,
        updatedAt: now,
        revision: revisionFor(current, principal, 'deleted', now),
      })
      if (deleted) touchDerived()
      return deleted ? ok({ path: deleted.path }) : err(notFound(`Page "${path}" disappeared while it was being deleted`))
    },

    async purge(path, principal) {
      const allowed = requirePagePermission(principal, 'admin:access')
      if (!allowed.ok) return allowed

      const current = await findByPath(path)
      if (!current) return err(notFound(`No page at "${path}"`))
      await pageWrites.purge(current.id, current.path)
      touchDerived()
      return ok({ path: current.path })
    },
  }
}
