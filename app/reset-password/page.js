import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ResetPasswordRedirect() {
  redirect('/forgot-password');
}
