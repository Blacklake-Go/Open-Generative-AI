import { NextResponse } from 'next/server';
import { getBrandConfig, getNavigationConfig } from '@/lib/services/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [brand, navigation] = await Promise.all([
      getBrandConfig(),
      getNavigationConfig(),
    ]);

    return NextResponse.json(
      {
        brand,
        navigation,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      }
    );
  } catch (err) {
    console.error('[api/site/branding] error:', err);
    return NextResponse.json(
      { error: 'Failed to load site branding config' },
      { status: 500 }
    );
  }
}
