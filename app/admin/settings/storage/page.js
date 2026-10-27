import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { getStorageAdminOverview } from '@/lib/services/storageAdmin';
import { PROVIDER_CATALOG, S3_PRESETS } from '@/lib/storage/providers';
import StorageSettingsClient from '@/components/admin/settings/StorageSettingsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '对象存储 | SupDance 运营后台',
};

export default async function StorageSettingsPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.storageRead);
  const canWrite = hasPermission(user?.role || user, PERMISSIONS.storageWrite);
  const initial = await getStorageAdminOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="系统与安全"
        title="对象存储"
        description="为新生成的图片、视频、音乐与头像选择存储位置，并把历史资源复制到新位置。保存只改变新增资源；历史资源始终按自己记录的 provider、Endpoint 和 Bucket 读取。"
      />
      <StorageSettingsClient
        initial={initial}
        catalog={PROVIDER_CATALOG}
        s3Presets={S3_PRESETS}
        canWrite={canWrite}
      />
    </div>
  );
}
