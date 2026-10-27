import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';
import { getAssetLibraryCopy } from '@/lib/assetLibraryCopy';
import JimengAssetCenter from '@/components/assets/JimengAssetCenter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '资产中心 — SupDance AI Studio',
  description: '个人 AI 创作资产与生成历史管理中心。',
};

export default async function AssetsPage() {
  const headerList = await headers();
  const cookieStore = await cookies();
  const locale = normalizeLocale(headerList.get('x-locale') || cookieStore.get('NEXT_LOCALE')?.value || 'en');

  const sessionToken = cookieStore.get('ko_session')?.value;
  let user = null;
  if (sessionToken) {
    try {
      user = await getUserBySession(sessionToken);
    } catch (e) {
      console.error('[AssetsPage] getUserBySession error:', e.message);
    }
  }

  if (!user) {
    if (locale === 'zh-CN') {
      redirect('/zh/login?redirect=/zh/assets');
    }
    redirect('/login?redirect=/assets');
  }

  if (locale === 'zh-CN') {
    redirect('/zh/assets');
  }

  return <JimengAssetCenter locale="en" initialUser={user} assetLibraryCopy={getAssetLibraryCopy('en')} />;
}
