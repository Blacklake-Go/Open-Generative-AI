import { getSeoConfig, generateSitemapXml } from '../../lib/services/seo.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const seo = await getSeoConfig();
    const xml = generateSitemapXml({
      canonicalBase: seo.canonicalBase,
      lastmod: new Date().toISOString().split('T')[0],
    });

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('[Sitemap] Generation error:', error);
    const fallbackXml = generateSitemapXml();
    return new Response(fallbackXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  }
}
