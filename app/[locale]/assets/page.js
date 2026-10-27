import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getLocaleConfig, isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';
import { getAssetLibraryCopy } from '@/lib/assetLibraryCopy';
import JimengAssetCenter from '@/components/assets/JimengAssetCenter';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const normalized = normalizeLocale(locale);
  return {
    title: normalized === 'zh-CN' ? '资产中心 — SupDance AI Studio' : 'Asset Center — SupDance AI Studio',
    description: 'Personal AI creation asset library and generation history.',
  };
}

export default async function LocalizedAssetsPage({ params }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const normalized = normalizeLocale(locale);
  if (normalized === 'en') notFound();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ko_session')?.value;
  let user = null;
  if (sessionToken) {
    try {
      user = await getUserBySession(sessionToken);
    } catch (e) {
      console.error('[LocalizedAssetsPage] getUserBySession error:', e.message);
    }
  }

  const { rootPath } = getLocaleConfig(normalized);
  const targetPath = `${rootPath}/assets`;

  if (!user) {
    redirect(`${rootPath}/login?redirect=${encodeURIComponent(targetPath)}`);
  }

  return <JimengAssetCenter locale={normalized} initialUser={user} assetLibraryCopy={getAssetLibraryCopy(normalized)} />;
}
