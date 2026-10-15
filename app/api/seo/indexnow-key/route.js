import { getSearchPushConfig, DEFAULT_SEARCH_PUSH_CONFIG } from '../../../../lib/services/seoPush.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = await getSearchPushConfig();
    const activeKey = config.indexNow?.key || DEFAULT_SEARCH_PUSH_CONFIG.indexNow.key;

    return new Response(activeKey, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('[IndexNowKey] Failed to retrieve key:', error);
    return new Response(DEFAULT_SEARCH_PUSH_CONFIG.indexNow.key, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
