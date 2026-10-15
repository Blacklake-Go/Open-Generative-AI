import AuthLayout from '@/components/auth/AuthLayout';
import ChangePasswordForm from '@/components/auth/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '修改密码 — supdance',
  description: '更新您的账号密码与登录凭证',
  robots: { index: false, follow: false },
};

export default function ZhChangePasswordPage() {
  return (
    <AuthLayout
      locale="zh-CN"
      title="修改密码"
      subtitle="更新您的创作者账号登录凭据与安全密码"
    >
      <ChangePasswordForm locale="zh-CN" />
    </AuthLayout>
  );
}
