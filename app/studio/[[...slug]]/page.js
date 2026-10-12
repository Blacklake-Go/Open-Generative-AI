import { notFound, redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { isStudioSlug, inferStudioTabFromModel } from '@/lib/studio-routes';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Studio — koyosim',
};

export default async function StudioPage({ params, searchParams }) {
  const { slug } = await params;
  // 路由层就拒掉 /studio/任意乱码：软 404 会让每个错拼链接都悄悄渲染一遍图像工作台。
  if (!isStudioSlug(slug)) notFound();

  const cookieStore = await cookies();
  const headerList = await headers();

  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
  const headerLocale = headerList.get('x-locale');
  const targetLocale = normalizeLocale(cookieLocale || headerLocale || 'en');

  // 若用户偏好为非英文，自动服务端重定向至对应的多语言专属路由，同时透传 query 参数 (如 ?tab=...&model=...)
  if (targetLocale !== 'en') {
    const config = getLocaleConfig(targetLocale);
    if (config?.rootPath) {
      const slugPath = Array.isArray(slug) && slug.length > 0 ? `/${slug.join('/')}` : '';
      const rawQuery = searchParams ? await searchParams : {};
      const queryEntries = Object.entries(rawQuery || {});
      let queryString = '';
      if (queryEntries.length > 0) {
        const qs = new URLSearchParams();
        for (const [key, val] of queryEntries) {
          if (Array.isArray(val)) {
            val.forEach((v) => qs.append(key, v));
          } else if (val !== undefined && val !== null) {
            qs.append(key, val);
          }
        }
        const qsString = qs.toString();
        if (qsString) queryString = `?${qsString}`;
      }
      redirect(`${config.rootPath}/studio${slugPath}${queryString}`);
    }
  }

  let user = null;
  try {
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
      locale="en"
      initialUser={user}
      initialTab={initialTab}
      initialModel={initialModel}
    />
  );
}
