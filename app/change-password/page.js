import AuthLayout from '@/components/auth/AuthLayout';
import ChangePasswordForm from '@/components/auth/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Change Password — supdance',
  description: 'Update your creator account password and security credentials.',
  robots: { index: false, follow: false },
};

export default function ChangePasswordPage() {
  return (
    <AuthLayout
      locale="en"
      title="Change Password"
      subtitle="Update your creator account password and security credentials"
    >
      <ChangePasswordForm locale="en" />
    </AuthLayout>
  );
}
