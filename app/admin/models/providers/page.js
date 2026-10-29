import ModelNavTabs from '@/components/admin/ModelNavTabs';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getProviderSecretsMetadata } from '@/lib/application/dataAccess.js';
import { getChannelsHealthOverview } from '@/lib/services/circuitBreaker';
import {
  getServerProviderApiKey,
  getServerProviderCredentialStatus,
  getProviderEnvCredentialHints,
} from '@/lib/services/providerSecrets.js';
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
      // 凭据解析与元数据由服务端完成，页面只拿到「来源 / 环境 / 变更时间 / 验证等级」，
      // 明文密钥停在服务端用于掩码计算，不进入客户端展示对象。
      const [secrets, credential] = await Promise.all([
        getProviderSecretsMetadata(c.id),
        getServerProviderCredentialStatus({ provider: c.id }),
      ]);
      const secretVal = credential.configured ? await getServerProviderApiKey({ provider: c.id }) : '';
      const maskedApiKey = secretVal ? maskSecretKey(secretVal) : '';
      const envHints = getProviderEnvCredentialHints(c.id);
      const brandInfo = brandStatsMap[c.id] || {
        totalModels: c.boundModelsCount || 0,
        totalBrands: 0,
        topBrands: [],
      };

      return {
        ...JSON.parse(JSON.stringify(c)),
        hasApiKey: credential.configured,
        maskedApiKey,
        credential: JSON.parse(JSON.stringify(credential)),
        storedSecrets: secrets,
        envNames: envHints.envNames,
        brandStats: brandInfo,
      };
    })
  );

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      <ModelNavTabs activeTab="providers" />
      <ProvidersManagerClient initialChannels={channels} />
    </div>
  );
}
