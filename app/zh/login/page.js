import AuthLayout from '@/components/auth/AuthLayout';
import LoginForm from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '创作者登录 — supdance',
  description: '登录开启 200+ 生成模型与统一创作算力',
  robots: { index: false, follow: false },
};

export default function ZhLoginPage() {
  return (
    <AuthLayout
      locale="zh-CN"
      title="创作者账号登录"
      subtitle="畅享 200+ 生成模型与统一创作算力"
    >
      <LoginForm locale="zh-CN" />
    </AuthLayout>
  );
}
