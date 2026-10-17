import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getSystemSettingsList } from '@/lib/services/settings';
import { getBrandConfig, getNavigationConfig } from '@/lib/services/branding';
import { getBannerConfig, getBannerHistory, getMotionConfig } from '@/lib/services/content';
import SettingsEditorClient from './SettingsEditorClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '系统设置与前台总控 | SupDance 运营后台',
};

export default async function SystemSettingsPage() {
  await requireAdminPagePermission(PERMISSIONS.settingsRead);

  // 一次性并发拉取全站配置数据
  const [
    settings,
    brand,
    navigation,
    banner,
    bannerHistory,
    motion,
  ] = await Promise.all([
    getSystemSettingsList().catch(() => []),
    getBrandConfig().catch(() => ({})),
    getNavigationConfig().catch(() => []),
    getBannerConfig().catch(() => ({})),
    getBannerHistory().catch(() => []),
    getMotionConfig().catch(() => ({})),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="系统与安全"
        title="系统设置与前台总控"
        description="一站式管理品牌标识、网站图标、全站顶栏导航、顶部推广公告、视觉动效能耗以及系统维护模式与访问安全。"
      />

      <SettingsEditorClient
        initialSettings={settings}
        initialBrand={brand}
        initialNavigation={navigation}
        initialBanner={banner}
        initialBannerHistory={bannerHistory}
        initialMotion={motion}
      />
    </>
  );
}
