import { getProvidersOverview } from '@/lib/services/providers';
import { PageHeader } from '@/components/admin/AdminUi';
import ProviderCard from '../ProviderCard';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function PaymentProvidersPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  const allProviders = await getProvidersOverview();
  const paymentProviders = allProviders.filter((p) => p.kind === 'payment');

  return (
    <>
      <PageHeader
        eyebrow="模型与集成"
        title="支付渠道"
        description="管理微信支付、支付宝与 Stripe 配置，并控制各渠道是否展示在结账页。仅完整配置且启用的渠道会对用户显示。"
      />

      <div className="grid gap-6 md:grid-cols-3">
        {paymentProviders.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </>
  );
}

