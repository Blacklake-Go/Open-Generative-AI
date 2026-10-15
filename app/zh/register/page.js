import AuthLayout from '@/components/auth/AuthLayout';
import RegisterForm from '@/components/auth/RegisterForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '注册创作者账号 — supdance',
  description: '注册加入 supdance，畅享 200+ 顶尖生成模型与统一创作算力',
  robots: { index: false, follow: false },
};

export default function ZhRegisterPage() {
  return (
    <AuthLayout
      locale="zh-CN"
      title="创建创作者账号"
      subtitle="畅享 200+ 顶尖生成模型与统一算力生态"
    >
      <RegisterForm locale="zh-CN" />
    </AuthLayout>
  );
}
