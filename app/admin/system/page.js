import { redirect } from 'next/navigation';
import { buildRedirectTarget, serializeSearchParams } from '@/lib/admin/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminSystemCatchallPage({ searchParams }) {
  const sp = await searchParams;
  const tab = sp?.tab;
  const queryString = sp ? serializeSearchParams(sp) : '';

  if (tab === 'email') {
    redirect(buildRedirectTarget('/admin/system/email', queryString));
  }

  // 默认收敛至登录方式设置页，保留 category 等查询参数
  redirect(buildRedirectTarget('/admin/system/login', queryString));
}
