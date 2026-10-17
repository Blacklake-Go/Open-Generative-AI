import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUserBySession } from '@/lib/services/auth';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';
import NewcomerOnboardingModal from '@/components/onboarding/NewcomerOnboardingModal';

export const dynamic = 'force-dynamic';

// 语言取 cookie / 用户档案而非 URL：/onboarding 只有无语言前缀这一棵树。
async function resolveViewer() {
  const cookieStore = await cookies();
  const user = await getUserBySession(cookieStore.get('ko_session')?.value);
  if (!user) return null;
  const locale = normalizeLocale(cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value || user.locale || 'en');
  return { user, locale };
}

export async function generateMetadata() {
  return {
    title: '新人创作引导 — SupDance',
    robots: { index: false, follow: false },
  };
}

export default async function OnboardingPage({ searchParams }) {
  const resolvedParams = searchParams ? await searchParams : {};
  const isPreview = resolvedParams?.preview === 'true' || resolvedParams?.preview === '1';
  const initialStep = parseInt(resolvedParams?.step, 10) === 2 ? 2 : 1;

  const viewer = await resolveViewer();
  if (!viewer && !isPreview) redirect('/');

  const user = viewer?.user || {
    id: '888888',
    userNumber: '888888',
    displayName: '新锐创作者',
    locale: 'zh',
    onboardingCompleted: false,
    onboardingStep: initialStep,
  };
  const locale = viewer?.locale || 'zh-CN';

  const config = getLocaleConfig(locale);
  const studioHref = config.rootPath ? `${config.rootPath}/studio` : '/studio';

  // 画像只采集一次：生产模式下完成后直接重定向到工作台；预览模式可反复体验
  if (user.onboardingCompleted && !isPreview) redirect(studioHref);

  return (
    <NewcomerOnboardingModal
      user={user}
      locale={locale}
      studioHref={studioHref}
      isPageMode={true}
      initialStep={initialStep}
    />
  );
}
