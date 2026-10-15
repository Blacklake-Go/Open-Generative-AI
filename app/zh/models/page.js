import ModelsScreenerPageClient from '@/components/models/ModelsScreenerPageClient';

export const metadata = {
  title: '模型总揽看板 — 全球前沿 AI 大模型实时算力与性能监控 | KOYO Studio',
  description:
    'KOYO Studio 模型总揽看板，实时追踪全网多模态大模型的时调用量、日调用量走势、生图数、平均响应时延与费率标准。',
};

export default function ZhModelsPage() {
  return <ModelsScreenerPageClient locale="zh-CN" />;
}
