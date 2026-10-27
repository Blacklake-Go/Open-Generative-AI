import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserBySession } from '@/lib/services/auth';
import { getAssetLibraryCopy } from '@/lib/assetLibraryCopy';
import JimengAssetCenter from '@/components/assets/JimengAssetCenter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '资产中心 — SupDance AI Studio',
  description: '个人 AI 创作资产与生成历史管理中心。',
};

export default async function ZhAssetsPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ko_session')?.value;
  let user = null;
  if (sessionToken) {
    try {
      user = await getUserBySession(sessionToken);
    } catch (e) {
      console.error('[ZhAssetsPage] getUserBySession error:', e.message);
    }
  }

  if (!user) {
    redirect('/zh/login?redirect=/zh/assets');
  }

  return <JimengAssetCenter locale="zh" initialUser={user} assetLibraryCopy={getAssetLibraryCopy('zh')} />;
}
