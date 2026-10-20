import AboutPageClient from '@/components/about/AboutPageClient';

export const metadata = {
  title: '关于我们 — 专业 · 可信赖的生成式 AI 生产力基础设施 | SupDance',
  description:
    'SupDance 聚合全球前沿多模态大模型与生产级工作流，为创作者、影视团队与企业提供模型发现、真实调用统计与生成工作流支持。',
};

export default function ZhAboutPage() {
  return <AboutPageClient locale="zh-CN" />;
}
