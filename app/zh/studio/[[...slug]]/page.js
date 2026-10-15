import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { isStudioSlug, inferStudioTabFromModel } from '@/lib/studio-routes';
import { getUserBySession } from '@/lib/services/auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Studio — SupDance',
};

export default async function ZhStudioPage({ params, searchParams }) {
  const { slug } = await params;
  if (!isStudioSlug(slug)) notFound();

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
      locale="zh-CN"
      initialUser={user}
      initialTab={initialTab}
      initialModel={initialModel}
    />
  );
}
