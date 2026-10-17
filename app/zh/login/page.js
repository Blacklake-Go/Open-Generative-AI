import AuthLayout from '@/components/auth/AuthLayout';
import LoginForm from '@/components/auth/LoginForm';
import { getAuthCopy } from '@/lib/authCopy';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const copy = getAuthCopy('zh-CN');
  return {
    title: `${copy.login.title} — supdance`,
    description: copy.login.subtitle,
    robots: { index: false, follow: false },
  };
}

export default function ZhLoginPage() {
  const copy = getAuthCopy('zh-CN');
  return (
    <AuthLayout
      locale="zh-CN"
      title={copy.login.title}
      subtitle={copy.login.subtitle}
    >
      <LoginForm locale="zh-CN" />
    </AuthLayout>
  );
}
