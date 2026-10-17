import { headers } from 'next/headers';
import AuthLayout from '@/components/auth/AuthLayout';
import LoginForm from '@/components/auth/LoginForm';
import { getAuthCopy, normalizeAuthLocale } from '@/lib/authCopy';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const headersList = await headers();
  const reqLocale = headersList.get('x-locale') || 'en';
  const locale = normalizeAuthLocale(reqLocale);
  const copy = getAuthCopy(locale);
  return {
    title: `${copy.login.title} — supdance`,
    description: copy.login.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage() {
  const headersList = await headers();
  const reqLocale = headersList.get('x-locale') || 'en';
  const locale = normalizeAuthLocale(reqLocale);
  const copy = getAuthCopy(locale);
  return (
    <AuthLayout
      locale={locale}
      title={copy.login.title}
      subtitle={copy.login.subtitle}
    >
      <LoginForm locale={locale} />
    </AuthLayout>
  );
}
