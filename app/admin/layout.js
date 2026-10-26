import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserBySession } from '@/lib/services/auth';
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/admin/permissions';
import AdminShell from '@/components/admin/AdminShell';

export const metadata = {
  title: '管理后台 | SupDance AI Studio',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/branding/favicon.svg?v=3', type: 'image/svg+xml' },
      { url: '/favicon.ico?v=3' },
      { url: '/branding/favicon-32x32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/branding/favicon-16x16.png?v=3', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico?v=3'],
    apple: [
      { url: '/branding/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default async function AdminLayout({ children }) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ko_session')?.value;
  const user = await getUserBySession(sessionToken);

  if (!user) {
    redirect('/account?next=/admin');
  }

  // 必须具备后台查看基本权限
  if (!hasPermission(user.role, PERMISSIONS.dashboardRead)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/[0.10] bg-surface/95 p-8 text-center shadow-2xl shadow-black/60 backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand">
            SupDance AI Studio
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-[-0.02em] leading-8 text-white">暂无后台访问权限</h1>
          <p className="mt-3 text-sm leading-6 tracking-[-0.005em] text-gray-400">
            当前登录账户身份为普通用户（{user.email}），无权访问运营管理后台。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/"
              className="inline-flex h-[38px] items-center rounded-xl bg-brand hover:bg-brand-hover px-4 text-xs font-semibold text-white transition-all active:scale-[0.98] shadow-sm"
            >
              返回主页
            </a>
            <a
              href="/account"
              className="inline-flex h-[38px] items-center rounded-lg border border-white/[0.10] bg-white/[0.04] px-4 text-xs font-medium text-gray-300 transition-all hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
            >
              切换账号
            </a>
          </div>
        </div>
      </div>
    );
  }

  const permissions = Array.from(ROLE_PERMISSIONS[user.role] || []);

  return (
    <AdminShell user={user} permissions={permissions}>
      {children}
    </AdminShell>
  );
}
