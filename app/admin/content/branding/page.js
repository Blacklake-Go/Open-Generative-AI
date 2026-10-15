import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getBrandConfig, getNavigationConfig } from '@/lib/services/branding';
import BrandingManagerClient from './BrandingManagerClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '品牌设置 | SupDance 运营后台',
};

export default async function BrandingManagementPage() {
  await requireAdminPagePermission(PERMISSIONS.contentRead);
  const [initialBrand, initialNavigation] = await Promise.all([
    getBrandConfig(),
    getNavigationConfig(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="内容与前台运营"
        title="品牌设置"
        description="统一管理 Studio 前台品牌 Logo、网站浏览器 Icon 图标（官方三色方块系统预设 / 自定义上传裁切）与顶栏导航。所见即所得实时仿真，全站前后端秒级动态生效。"
      />

      <BrandingManagerClient initialBrand={initialBrand} initialNavigation={initialNavigation} />
    </>
  );
}

