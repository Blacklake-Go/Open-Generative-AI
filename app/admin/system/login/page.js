import { headers } from 'next/headers';
import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { getProvidersOverview } from '@/lib/services/providers';
import { getSettingByKey } from '@/lib/services/settings';
import { getSmsAdminOverview } from '@/lib/smsAdmin';
import { isOAuthProviderConfigured } from '@/lib/oauth';
import {
  SOCIAL_LOGIN_CATALOG,
  SOCIAL_LOGIN_REGIONS,
  SOCIAL_LOGIN_SETTING_KEY,
  sanitizeSocialLoginConfig,
} from '@/lib/auth/socialProviders';
import { isChinaIp, resolveClientIp } from '@/lib/security/chinaIpBlock';
import LoginMethodsClient from './LoginMethodsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '登录方式与连通性 | 管理后台',
};

// 前台按 OAuth 路由段命名渠道（/api/auth/oauth/wechat），后台凭据记录用
// wechat_oauth 命名空间以免与微信支付串线，这里做一次桥接。
const CREDENTIAL_PROVIDER_ID = { wechat: 'wechat_oauth' };

const REGION_META = {
  mainland_china: {
    label: '中国大陆',
    description: '命中境内 IP 段的访客只会看到这一组扫码/快捷登录。',
  },
  international: {
    label: '海外',
    description: '其余全部 IP（含港澳台与境外节点）看到这一组 OAuth 登录。',
  },
};

export default async function LoginMethodsPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);
  const canWrite = hasPermission(user, PERMISSIONS.providersWrite);

  const [providersOverview, socialSetting, smsOverview] = await Promise.all([
    getProvidersOverview(),
    getSettingByKey(SOCIAL_LOGIN_SETTING_KEY),
    getSmsAdminOverview(),
  ]);

  const socialProviders = (providersOverview || []).filter((p) => p.kind === 'social');
  const socialConfig = sanitizeSocialLoginConfig(socialSetting?.value);

  const regions = (SOCIAL_LOGIN_REGIONS || []).map((regionId) => {
    const configEntries = socialConfig[regionId] || [];
    const enabledIds = new Set(
      configEntries.filter((entry) => entry.enabled !== false).map((entry) => entry.id)
    );
    const catalogProviders = SOCIAL_LOGIN_CATALOG[regionId] || [];
    const channels = catalogProviders.map((pId) => {
      const mappedId = CREDENTIAL_PROVIDER_ID[pId] || pId;
      const p = socialProviders.find((sp) => sp.id === mappedId) || {};
      const providerData = {
        ...p,
        id: mappedId,
        channelId: pId,
        name: p.name || pId,
        description: p.description || '',
        mode: p.mode || 'OAuth 2.0',
        configured: Boolean(p.configured),
        callbackPath: p.callbackPath || `/api/auth/oauth/${pId}/callback`,
        secretKeys: p.secretKeys || [
          { name: 'client_id', label: 'Client ID 客户端标识', placeholder: '输入 Client ID' },
          { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: '输入 Client Secret' },
        ],
        lastCheck: p.lastCheck || null,
      };
      return {
        id: pId,
        providerId: mappedId,
        name: p.name || pId,
        description: p.description || '',
        enabled: enabledIds.has(pId),
        configured: Boolean(p.configured),
        keys: p.keys || [],
        lastCheck: p.lastCheck || null,
        callbackPath: p.callbackPath || `/api/auth/oauth/${pId}/callback`,
        provider: providerData,
      };
    });
    return {
      id: regionId,
      label: REGION_META[regionId]?.label || regionId,
      description: REGION_META[regionId]?.description || '',
      channels,
    };
  });

  const reqHeaders = await headers();
  const resolved = resolveClientIp(reqHeaders);
  const clientIp = resolved?.ip || '127.0.0.1';
  const ipSource = resolved?.source || 'missing-headers';
  const chinaIp = isChinaIp(clientIp, reqHeaders);

  const diagnostics = {
    clientIp,
    ipSource,
    isChinaIp: chinaIp,
    region: chinaIp ? 'mainland_china' : 'international',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="登录方式与连通性"
        description="管理境内外 OAuth 社交登录渠道、短信线路配置与连通性探针。"
      />
      <LoginMethodsClient
        regions={regions}
        diagnostics={diagnostics}
        smsInitial={smsOverview}
        canWrite={canWrite}
      />
    </div>
  );
}
