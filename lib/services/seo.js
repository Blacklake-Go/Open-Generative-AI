import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as seoRepo from '../repositories/seo.js';

export * from './seoCore.js';
import {
  DEFAULT_SEO_CONFIG,
  DEFAULT_INDEXABLE_ROUTES,
  normalizeVerificationTag,
  normalizeSeoConfig,
} from './seoCore.js';

/**
 * Retrieve current active SEO configuration with default fallback.
 */
export async function getSeoConfig() {
  const stored = await seoRepo.getSeoSetting('site_seo');
  const base = stored ? normalizeSeoConfig(stored) : { ...DEFAULT_SEO_CONFIG };
  try {
    const brandRow = await seoRepo.getSeoSetting('site_brand');
    const brandVal = brandRow && typeof brandRow === 'object' ? brandRow : {};
    if (brandVal.siteTitle) base.title = brandVal.siteTitle;
    if (brandVal.titleTemplate) base.titleTemplate = brandVal.titleTemplate;
  } catch {}
  return base;
}

/**
 * Persist updated SEO configuration, log audit and sync public/robots.txt.
 */
export async function saveSeoConfig(config, user = null) {
  const normalized = normalizeSeoConfig(config);
  const actor = user?.email || user?.name || 'system';

  await seoRepo.saveSeoSetting('site_seo', normalized, actor);

  // Sync public/robots.txt with latest canonicalBase and custom rules
  try {
    const robotsTxt = generateRobotsTxt(normalized);
    await syncPublicRobotsTxt(robotsTxt);
  } catch {
    // Non-blocking file sync
  }

  return normalized;
}

/**
 * Generates dynamic XML string for sitemap.xml compliant with sitemaps.org schema.
 * Accepts either ({ routes, canonicalBase, lastmod }) or (routes, baseUrl, lastmod).
 */
export function generateSitemapXml(optionsOrRoutes = {}, maybeBaseUrl = null, maybeLastmod = null) {
  let routes = null;
  let canonicalBase = DEFAULT_SEO_CONFIG.canonicalBase;
  let lastmod = new Date().toISOString().split('T')[0];

  if (Array.isArray(optionsOrRoutes)) {
    routes = optionsOrRoutes;
    if (maybeBaseUrl) canonicalBase = maybeBaseUrl;
    if (maybeLastmod) lastmod = maybeLastmod;
  } else if (optionsOrRoutes && typeof optionsOrRoutes === 'object') {
    routes = optionsOrRoutes.routes;
    if (optionsOrRoutes.canonicalBase) canonicalBase = optionsOrRoutes.canonicalBase;
    else if (optionsOrRoutes.baseUrl) canonicalBase = optionsOrRoutes.baseUrl;
    if (optionsOrRoutes.lastmod) lastmod = optionsOrRoutes.lastmod;
  }

  if (!routes || !Array.isArray(routes) || routes.length === 0) {
    routes = DEFAULT_INDEXABLE_ROUTES;
  }

  const cleanBase = canonicalBase.replace(/\/+$/, '');
  const urlEntries = routes
    .map((r) => {
      let rawPath = typeof r === 'string' ? r : r.path;
      if (!rawPath) return null;
      // Strip query parameters and hash fragments
      rawPath = String(rawPath).split('?')[0].split('#')[0];
      // Normalize slashes
      const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
      // Skip private admin or api paths
      if (cleanPath.startsWith('/admin') || cleanPath.startsWith('/api')) {
        return null;
      }
      const loc = cleanPath === '/' ? `${cleanBase}/` : `${cleanBase}${cleanPath.replace(/\/+$/, '')}`;
      const priority = typeof r === 'object' && r.priority ? r.priority : (cleanPath === '/' ? '1.0' : '0.8');
      const changefreq = typeof r === 'object' && r.changefreq ? r.changefreq : 'daily';
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>`;
}

/**
 * Generates robots.txt rules compliant with search engine specifications.
 * Supports canonicalBase and optional custom rules.
 */
export function generateRobotsTxt(optionsOrConfig = {}) {
  let canonicalBase = DEFAULT_SEO_CONFIG.canonicalBase;
  let customRules = '';

  if (optionsOrConfig && typeof optionsOrConfig === 'object') {
    canonicalBase = optionsOrConfig.canonicalBase || canonicalBase;
    customRules = optionsOrConfig.customRules ?? optionsOrConfig.robotsTxtCustom ?? '';
  }

  const cleanBase = canonicalBase.replace(/\/+$/, '');
  const baseRules = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /onboarding',
    'Disallow: /profile',
    'Disallow: /design-system',
  ];

  if (customRules && typeof customRules === 'string' && customRules.trim()) {
    baseRules.push('', '# Custom Rules', customRules.trim());
  }

  baseRules.push('', `Sitemap: ${cleanBase}/sitemap.xml`);
  return `${baseRules.join('\n')}\n`;
}

/**
 * Safely writes robots.txt content to disk in public/robots.txt.
 */
export async function syncPublicRobotsTxt(content) {
  try {
    const publicPath = path.resolve(process.cwd(), 'public/robots.txt');
    await fs.writeFile(publicPath, content, 'utf8');
    return true;
  } catch (error) {
    console.warn('[SEO] Failed to sync public/robots.txt:', error.message);
    return false;
  }
}

/**
 * Construct Next.js App Router metadata object for generateMetadata() in layout.js.
 */
export function buildMetadata(seoConfig) {
  const norm = normalizeSeoConfig(seoConfig || DEFAULT_SEO_CONFIG);
  const base = norm.canonicalBase || DEFAULT_SEO_CONFIG.canonicalBase;

  return {
    metadataBase: new URL(base),
    title: {
      default: norm.title,
      template: norm.titleTemplate,
    },
    description: norm.description,
    keywords: norm.keywords,
    alternates: {
      canonical: '/',
    },
    openGraph: {
      title: norm.openGraph?.title || norm.title,
      description: norm.openGraph?.description || norm.description,
      url: base,
      siteName: 'SupDance',
      images: norm.openGraph?.image ? [{ url: norm.openGraph.image }] : [{ url: '/og-image.png' }],
      type: norm.openGraph?.type || 'website',
    },
    twitter: {
      card: norm.twitter?.card || 'summary_large_image',
      site: norm.twitter?.site || undefined,
      creator: norm.twitter?.creator || undefined,
      title: norm.openGraph?.title || norm.title,
      description: norm.openGraph?.description || norm.description,
      images: norm.openGraph?.image ? [norm.openGraph.image] : ['/og-image.png'],
    },
    verification: {
      google: norm.verification?.google || undefined,
      yandex: norm.verification?.yandex || undefined,
      other: {
        ...(norm.verification?.baidu ? { 'baidu-site-verification': norm.verification.baidu } : {}),
        ...(norm.verification?.bing ? { 'msvalidate.01': norm.verification.bing } : {}),
      },
    },
  };
}
