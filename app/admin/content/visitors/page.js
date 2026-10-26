import { Suspense } from 'react';
import { PageHeader } from '@/components/admin/AdminUi';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import VisitorsWorkbenchClient from './VisitorsWorkbenchClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '访客与 SEO | 管理后台',
};

export default async function VisitorsPage() {
  await requireAdminPagePermission(PERMISSIONS.usersRead);

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs pathname="/admin/content/visitors" />
      <PageHeader
        eyebrow="内容与前台"
        title="访客与 SEO"
        description="管理第三方访客统计分析代码配置，以及网站全局 SEO 规则、搜索引擎主动推送与收录连通性。"
      />
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <VisitorsWorkbenchClient />
      </Suspense>
    </div>
  );
}
