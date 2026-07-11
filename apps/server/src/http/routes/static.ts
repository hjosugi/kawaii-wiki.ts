import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Principal } from '@kawaii-wiki/core'
import type { Env } from '../../env.ts'
import type { Services } from '../../services/index.ts'
import type { Page } from '../../db/schema.ts'
import type { BaseApp } from '../base.ts'

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const absolutePageUrl = (origin: string, path: string): string =>
  `${origin.replace(/\/+$/, '')}/${path.split('/').map(encodeURIComponent).join('/')}`

interface SeoMeta {
  readonly title: string
  readonly description: string
  readonly url: string
  readonly siteName: string
  readonly image?: string | null
}

const firstImageSrc = (html: string): string | null => {
  const match = html.match(/<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')/i)
  return match?.[1] ?? match?.[2] ?? null
}

const absoluteUrl = (origin: string, value: string): string => {
  try {
    return new URL(value, `${origin.replace(/\/+$/, '')}/`).toString()
  } catch {
    return value
  }
}

const seoForPage = (
  page: Page | null,
  origin: string,
  siteName: string,
  requestPath = '/',
  preferRequestUrl = false,
): SeoMeta => {
  const base = origin.replace(/\/+$/, '')
  const requestUrl = `${base}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`
  const pageUrl = page && !preferRequestUrl ? absolutePageUrl(base, page.path) : requestUrl
  const pageTitle = page ? `${page.icon ? `${page.icon} ` : ''}${page.title}` : ''
  const title = page ? `${pageTitle} · ${siteName}` : siteName
  const description = page?.description?.trim() || siteName
  const image = page ? page.coverUrl || firstImageSrc(page.renderedHtml) : null
  return {
    title,
    description,
    url: pageUrl,
    siteName,
    image: image ? absoluteUrl(base, image) : null,
  }
}

const seoTags = (seo: SeoMeta): string => [
  `    <meta name="description" content="${xmlEscape(seo.description)}" />`,
  `    <meta property="og:site_name" content="${xmlEscape(seo.siteName)}" />`,
  `    <meta property="og:title" content="${xmlEscape(seo.title)}" />`,
  `    <meta property="og:description" content="${xmlEscape(seo.description)}" />`,
  `    <meta property="og:type" content="article" />`,
  `    <meta property="og:url" content="${xmlEscape(seo.url)}" />`,
  ...(seo.image ? [`    <meta property="og:image" content="${xmlEscape(seo.image)}" />`] : []),
  `    <meta name="twitter:card" content="${seo.image ? 'summary_large_image' : 'summary'}" />`,
  `    <meta name="twitter:title" content="${xmlEscape(seo.title)}" />`,
  `    <meta name="twitter:description" content="${xmlEscape(seo.description)}" />`,
  ...(seo.image ? [`    <meta name="twitter:image" content="${xmlEscape(seo.image)}" />`] : []),
].join('\n')

const injectSeoIntoHtml = (html: string, seo: SeoMeta): string => {
  const withTitle = /<title>.*?<\/title>/i.test(html)
    ? html.replace(/<title>.*?<\/title>/i, `<title>${xmlEscape(seo.title)}</title>`)
    : html
  return withTitle.replace('</head>', `${seoTags(seo)}\n  </head>`)
}

const pagePathForShellRequest = (pathname: string, homePath: string): string | null => {
  const raw = pathname === '/ui' ? '/' : pathname.startsWith('/ui/') ? pathname.slice('/ui'.length) : pathname
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  const trimmed = decoded.replace(/^\/+|\/+$/g, '')
  if (!trimmed) return homePath
  if (trimmed.startsWith('_') || trimmed.includes('\\') || trimmed.includes('\0')) return null
  return trimmed
}

const shareTokenForShellRequest = (pathname: string): string | null => {
  if (!pathname.startsWith('/_share/')) return null
  const raw = pathname.slice('/_share/'.length).split('/')[0]
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

export interface StaticRoutesContext {
  readonly env: Env
  readonly services: Services
  readonly hasWebDist: boolean
  readonly webIndex: string
  readonly privateWiki: () => boolean
  readonly canReadPage: (principal: Principal | null, path?: string) => boolean
}

export const createStaticRoutes = ({
  env,
  services,
  hasWebDist,
  webIndex,
  privateWiki,
  canReadPage,
}: StaticRoutesContext) => {
  let webIndexHtmlCache: string | null = null
  const webIndexHtml = async (): Promise<string> => {
    webIndexHtmlCache ??= await Bun.file(webIndex).text()
    return webIndexHtmlCache
  }

  const shellResponse = async (pathname: string, principal: Principal | null): Promise<Response> => {
    const shareToken = shareTokenForShellRequest(pathname)
    const shared = shareToken ? services.shares.resolve(shareToken) : null
    const pagePath = shared?.ok ? null : pagePathForShellRequest(pathname, services.settings.public().homePath)
    const resolved = pagePath && (principal || !privateWiki()) && canReadPage(principal, pagePath)
      ? services.pages.resolveByPath(pagePath)
      : null
    const page = shared?.ok ? shared.value.page : resolved?.ok ? resolved.value.page : null
    const html = injectSeoIntoHtml(
      await webIndexHtml(),
      seoForPage(page, env.auth.publicOrigin, env.auth.siteName, pathname, Boolean(shared?.ok)),
    )
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }

  return (app: BaseApp) =>
    app
      .get('/ui', async ({ principal }) => {
        if (!hasWebDist) return new Response('Not found', { status: 404 })
        return shellResponse('/ui', principal)
      })
      .get('/ui/*', async ({ params, principal }) => {
        if (!hasWebDist) return new Response('Not found', { status: 404 })
        const rel = params['*']
        if (!rel || rel === '/') return shellResponse('/ui', principal)
        if (rel.includes('..') || rel.includes('\\')) return new Response('Not found', { status: 404 })
        const file = join(env.webDistDir, rel)
        if (existsSync(file)) {
          return new Response(Bun.file(file), {
            headers: { 'x-content-type-options': 'nosniff' },
          })
        }
        if (rel.includes('.')) return new Response('Not found', { status: 404 })
        return shellResponse(`/ui/${rel}`, principal)
      })
      .get('*', async ({ request, principal }) => {
        if (!hasWebDist) return new Response('Not found', { status: 404 })
        const pathname = new URL(request.url).pathname
        if (pathname.startsWith('/api') || pathname.startsWith('/assets')) {
          return new Response('Not found', { status: 404 })
        }
        return shellResponse(pathname, principal)
      })
}
