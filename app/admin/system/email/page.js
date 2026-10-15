import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { getEmailSmtpOverview } from '@/lib/emailAdmin';
import EmailSettingsClient from './EmailSettingsClient';
import MarketingEmailSection from './MarketingEmailSection';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '邮件发信设置 | 管理后台',
};

export default async function EmailSendingPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);
  const canWrite = hasPermission(user, PERMISSIONS.providersWrite);
  const initial = await getEmailSmtpOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        title="邮件发信设置"
        description="配置 SMTP 邮件发信服务器、测试投递、查看线路健康度及营销模板。"
      />
      <EmailSettingsClient initial={initial} canWrite={canWrite} />
      <MarketingEmailSection canWrite={canWrite} />
    </div>
  );
}
