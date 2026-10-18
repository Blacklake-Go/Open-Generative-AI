import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getCrawledPrompts, getCrawlerConfig } from '@/lib/services/xPromptCrawler';
import XPromptsConsoleClient from './XPromptsConsoleClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'X 提示词灵感与控制台 | SupDance 运营后台',
};

export default async function XPromptsPage() {
  await requireAdminPagePermission(PERMISSIONS.contentRead);

  const initialData = await getCrawledPrompts({ category: 'all', page: 1, pageSize: 24 });
  const initialConfig = await getCrawlerConfig();

  const safeConfig = {
    ...initialConfig,
    cookies: {
      hasAuthToken: Boolean(initialConfig.cookies?.authToken),
      authTokenMasked: initialConfig.cookies?.authToken
        ? `${initialConfig.cookies.authToken.slice(0, 4)}••••${initialConfig.cookies.authToken.slice(-4)}`
        : '',
      hasCt0: Boolean(initialConfig.cookies?.ct0),
      ct0Masked: initialConfig.cookies?.ct0
        ? `${initialConfig.cookies.ct0.slice(0, 4)}••••${initialConfig.cookies.ct0.slice(-4)}`
        : '',
    },
  };

  return (
    <XPromptsConsoleClient
      initialData={initialData}
      initialConfig={safeConfig}
    />
  );
}
