import { getProvidersOverview } from '@/lib/services/providers';
import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import PaymentProvidersPanel from './PaymentProvidersPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '支付渠道与网关配置 | 管理后台',
};

export default async function PaymentProvidersPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);
  const canWrite = hasPermission(user?.role || user, PERMISSIONS.providersWrite);
  const allProviders = await getProvidersOverview();
  const paymentProviders = allProviders.filter((p) => p.kind === 'payment');

  return (
    <>
      <PageHeader
        eyebrow="模型与集成"
        title="支付渠道"
        description="管理微信支付、支付宝、Stripe 与 PayPal 配置，并控制各渠道是否展示在结账页。仅完整配置且启用的渠道会对用户显示。"
      />

      <PaymentProvidersPanel providers={paymentProviders} canWrite={canWrite} />
    </>
  );
}

