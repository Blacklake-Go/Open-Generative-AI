import AboutPageClient from '@/components/about/AboutPageClient';

export const metadata = {
  title: '关于我们 — 专业 · 可信赖的生成式 AI 生产力基础设施 | KOYO Studio',
  description:
    'KOYO Studio 聚合全球前沿多模态大模型与生产级工作流，为数百万创作者、影视团队与企业提供确定性与毫秒级算力调度支撑。',
};

export default function ZhAboutPage() {
  return <AboutPageClient locale="zh-CN" />;
}
