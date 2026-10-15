import AuthLayout from '@/components/auth/AuthLayout';
import RegisterForm from '@/components/auth/RegisterForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Create Account — supdance',
  description: 'Create your creator account on supdance',
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AuthLayout
      locale="en"
      title="Create Creator Account"
      subtitle="Access 200+ generative AI models and unified creative compute"
    >
      <RegisterForm locale="en" />
    </AuthLayout>
  );
}
