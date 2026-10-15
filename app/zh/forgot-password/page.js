import AuthLayout from '@/components/auth/AuthLayout';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '找回密码 — supdance',
  description: '通过验证码找回或重置您的账号密码',
  robots: { index: false, follow: false },
};

export default function ZhForgotPasswordPage() {
  return (
    <AuthLayout
      locale="zh-CN"
      title="找回密码与账号"
      subtitle="通过注册邮箱安全重置您的访问凭证"
    >
      <ForgotPasswordForm locale="zh-CN" />
    </AuthLayout>
  );
}
