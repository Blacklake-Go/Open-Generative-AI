import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getProviderSecretsMetadata } from '@/lib/application/dataAccess.js';
import { getChannelsHealthOverview } from '@/lib/services/circuitBreaker';
import { getProviderSecret } from '@/lib/repositories/providers.js';
import { getServerProviderApiKey } from '@/lib/services/providerSecrets.js';
import { maskSecretKey } from '@/lib/admin/redaction.js';
import { getProviderBrandStats } from '@/lib/services/modelBrands.js';
import ProvidersManagerClient from './ProvidersManagerClient';

export const dynamic = 'force-dynamic';

export default async function ProvidersAdminPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);

  const [rawChannels, brandStatsMap] = await Promise.all([
    getChannelsHealthOverview(),
    getProviderBrandStats(),
  ]);

  const channels = await Promise.all(
    rawChannels.map(async (c) => {
      const secrets = await getProviderSecretsMetadata(c.id);
      const secretVal =
        (await getServerProviderApiKey({ provider: c.id })) ||
        (await getProviderSecret(c.id, 'api_key')) ||
        (await getProviderSecret(c.id, 'apiKey')) ||
        process.env[`${c.id.toUpperCase()}_API_KEY`] ||
        '';
      const maskedApiKey = secretVal ? maskSecretKey(secretVal) : '';
      const brandInfo = brandStatsMap[c.id] || {
        totalModels: c.boundModelsCount || 0,
        totalBrands: 0,
        topBrands: [],
      };

      return {
        ...JSON.parse(JSON.stringify(c)),
        hasApiKey:
          Boolean(maskedApiKey) ||
          secrets.some((s) => s.name === 'api_key' || s.name === 'apiKey') ||
          Boolean(process.env[`${c.id.toUpperCase()}_API_KEY`]),
        maskedApiKey,
        brandStats: brandInfo,
      };
    })
  );

  return (
    <>
      <PageHeader
        eyebrow="AI 模型中心"
        title="模型渠道与健康"
        description="统一管理平台各 AI 供应商驱动连接、API Key 与路由优先级，实时监控通道成功率、延迟及断路器熔断状态。"
      />
      <ProvidersManagerClient initialChannels={channels} />
    </>
  );
}
