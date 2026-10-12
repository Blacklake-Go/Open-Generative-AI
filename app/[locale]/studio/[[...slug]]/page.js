import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { isStudioSlug, inferStudioTabFromModel } from '@/lib/studio-routes';
import { getLocaleConfig, isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';

export const dynamic = 'force-dynamic';

export default async function LocalizedStudioPage({ params, searchParams }) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const normalized = normalizeLocale(locale);
  if (normalized === 'en') notFound();
  if (!isStudioSlug(slug)) notFound();
  // 别名前缀（/ja/studio、/es-ES/studio）在中间件已 308；这里再钉一次，
  // 保证同一页只有一条可索引 URL —— 页面层不读 cookie/header，语言由路径决定。
  const { rootPath } = getLocaleConfig(normalized);
  if (rootPath.slice(1) !== locale) notFound();

  let user = null;
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('ko_session')?.value;
    if (sessionToken) {
      user = await getUserBySession(sessionToken);
    }
  } catch {}

  const rawQuery = searchParams ? await searchParams : {};
  const initialModel = typeof rawQuery?.model === 'string' ? rawQuery.model : '';
  const initialTab = typeof rawQuery?.tab === 'string'
    ? rawQuery.tab
    : (Array.isArray(slug) && slug[0] ? slug[0] : (initialModel ? inferStudioTabFromModel(initialModel, 'image') : 'image'));

  return (
    <StandaloneShell
      locale={normalized}
      initialUser={user}
      initialTab={initialTab}
      initialModel={initialModel}
    />
  );
}
