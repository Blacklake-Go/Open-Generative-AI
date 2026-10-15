import AuthLayout from '@/components/auth/AuthLayout';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reset Password — supdance',
  description: 'Reset your account password or recover account on supdance',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      locale="en"
      title="Reset Password & Account"
      subtitle="Securely recover your credentials with registered email"
    >
      <ForgotPasswordForm locale="en" />
    </AuthLayout>
  );
}
