import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ZhResetPasswordRedirect() {
  redirect('/zh/forgot-password');
}
