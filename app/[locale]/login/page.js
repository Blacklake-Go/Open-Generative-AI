import { notFound, permanentRedirect } from 'next/navigation';
import AuthLayout from '@/components/auth/AuthLayout';
import LoginForm from '@/components/auth/LoginForm';
import { getLocaleConfig, isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { getAuthCopy } from '@/lib/authCopy';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const normalized = normalizeLocale(locale);
  const copy = getAuthCopy(normalized);
  return {
    title: `${copy.login.title} — supdance`,
    description: copy.login.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function LocalizedLoginPage({ params }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const normalized = normalizeLocale(locale);
  // Default english route uses /login without prefix
  if (normalized === 'en') {
    permanentRedirect('/login');
  }

  // Ensure canonical prefix is used (e.g. /zh-CN/login redirects to /zh/login)
  const config = getLocaleConfig(normalized);
  if (config.rootPath && locale !== config.rootPath.slice(1)) {
    permanentRedirect(`${config.rootPath}/login`);
  }

  const copy = getAuthCopy(normalized);

  return (
    <AuthLayout
      locale={normalized}
      title={copy.login.title}
      subtitle={copy.login.subtitle}
    >
      <LoginForm locale={normalized} />
    </AuthLayout>
  );
}
