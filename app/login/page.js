import AuthLayout from '@/components/auth/AuthLayout';
import LoginForm from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign In — supdance',
  description: 'Sign in to access 200+ generative AI models and unified creative compute.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthLayout
      locale="en"
      title="Creator Account Login"
      subtitle="Access 200+ generative AI models and unified creative compute"
    >
      <LoginForm locale="en" />
    </AuthLayout>
  );
}
