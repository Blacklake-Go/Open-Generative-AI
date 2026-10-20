import ModelDetailPageClient from '@/components/models/ModelDetailPageClient';
import { getModelById } from '@/lib/modelCenter/modelScreenerData';

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  const model = getModelById(id);

  if (!model) {
    return {
      title: '模型详情 — SupDance',
      description: '查看模型说明、上架状态与过去 24 小时的真实调用数据。',
    };
  }

  return {
    title: `${model.name} — 模型详情 | SupDance`,
    description: `查看 ${model.provider} 旗下 ${model.name} 在 SupDance 的上架状态、价格与过去 24 小时真实调用数据。`,
  };
}

export default async function ZhModelDetailPage({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  return <ModelDetailPageClient modelId={id} locale="zh-CN" />;
}
