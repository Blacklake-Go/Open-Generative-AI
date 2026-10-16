import ModelDetailPageClient from '@/components/models/ModelDetailPageClient';
import { getModelById } from '@/lib/modelCenter/modelScreenerData';

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  const model = getModelById(id);

  if (!model) {
    return {
      title: 'AI 大模型实时遥测与性能专页 — SupDance',
      description: 'SupDance 聚合全球前沿多模态大模型实时时调用量、生图数、平均响应时延与费率分析。',
    };
  }

  return {
    title: `${model.name} (${model.symbol}) — 实时调用量走势 · 生图数与算力指标概览 | SupDance`,
    description: `查看 ${model.provider} 旗下 ${model.name} 在 SupDance 的实时时调用量、日调用量走势折线图、生图生成数、首字时延及成本费率拆解。`,
  };
}

export default async function ZhModelDetailPage({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  return <ModelDetailPageClient modelId={id} locale="zh-CN" />;
}
