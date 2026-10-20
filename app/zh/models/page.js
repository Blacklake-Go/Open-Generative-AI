import ModelsScreenerPageClient from '@/components/models/ModelsScreenerPageClient';

export const metadata = {
  title: '模型目录 — 已上架模型与 24h 真实调用统计 | SupDance',
  description:
    '浏览 SupDance 已上架模型，查看过去 24 小时的真实调用量、成功率、平均耗时与价格。',
};

export default function ZhModelsPage() {
  return <ModelsScreenerPageClient locale="zh-CN" />;
}
