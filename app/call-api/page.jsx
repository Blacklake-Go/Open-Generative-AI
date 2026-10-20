import Link from 'next/link';
import { ArrowLeft, ArrowRight, Boxes, Code2, Compass, Cpu, Shield } from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import { SpatialBackground } from '@/components/spatial';

export const metadata = {
  title: 'Developer API — Coming Soon | SupDance',
  description:
    'SupDance developer API access is still in preparation. Public API keys, SDKs, and MCP integration are not available yet.',
  robots: { index: false, follow: false },
};

export default function CallApiPage({ locale = 'en' }) {
  const isChinese = Boolean(locale?.includes('zh'));
  const studioHref = isChinese ? '/zh/studio' : '/studio';
  const modelsHref = isChinese ? '/zh/models' : '/models';
  const communityHref = isChinese ? '/zh/community' : '/community';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07080c] font-sans text-white">
      <StudioHeader locale={locale} activeTab="call-api" className="relative z-40" />
      <SpatialBackground />

      <main className="relative z-10 mx-auto flex max-w-[1100px] flex-col px-4 pb-24 pt-16 sm:px-6 lg:px-12">
        <div className="mb-8 flex items-center gap-2 font-mono text-xs text-white/40">
          <Link href={isChinese ? '/zh' : '/'} className="flex items-center gap-1.5 transition hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            {isChinese ? '返回首页' : 'Back home'}
          </Link>
          <span>/</span>
          <span>{isChinese ? '开放平台' : 'Developer API'}</span>
        </div>

        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-mono text-[#00f5d4]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00f5d4]" />
            {isChinese ? '开发者 API · 筹备中' : 'Developer API · In preparation'}
          </div>

          <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            {isChinese ? '公开 API 尚未开放' : 'Public API access is not available yet'}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60 sm:text-base">
            {isChinese
              ? '我们正在准备正式的开发者 API、API Key 管理与 SDK 接入能力。当前页面不提供申请入口，也没有可用的接口密钥或调用额度。'
              : 'We are preparing the developer API, API key management, and SDK access. There is no application form, API key, or quota available on this page yet.'}
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href={modelsHref}
            className="group rounded-2xl border border-white/10 bg-[#101216] p-5 transition hover:border-white/25"
          >
            <Boxes className="h-5 w-5 text-[#00f5d4]" />
            <h2 className="mt-4 text-sm font-bold">{isChinese ? '模型目录' : 'Model directory'}</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              {isChinese ? '查看已上架模型与真实 24h 调用统计。' : 'Browse listed models with actual 24-hour usage.'}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#3772FF]">
              {isChinese ? '前往模型目录' : 'View models'}
              <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href={studioHref}
            className="group rounded-2xl border border-white/10 bg-[#101216] p-5 transition hover:border-white/25"
          >
            <Cpu className="h-5 w-5 text-[#3772FF]" />
            <h2 className="mt-4 text-sm font-bold">{isChinese ? 'Studio 工作台' : 'Studio workspace'}</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              {isChinese ? '通过网页工作台直接使用已上架模型。' : 'Use listed models directly in the web workspace.'}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#3772FF]">
              {isChinese ? '进入 Studio' : 'Open Studio'}
              <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href={communityHref}
            className="group rounded-2xl border border-white/10 bg-[#101216] p-5 transition hover:border-white/25"
          >
            <Compass className="h-5 w-5 text-[#e11d74]" />
            <h2 className="mt-4 text-sm font-bold">{isChinese ? '社区与公告' : 'Community & updates'}</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              {isChinese ? 'API 开放时会在社区与站内公告同步。' : 'API availability will be announced in the community.'}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#3772FF]">
              {isChinese ? '前往社区' : 'Visit community'}
              <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Shield className="h-5 w-5 text-[#00f5d4]" />
          <p className="flex-1 text-xs leading-relaxed text-white/50">
            {isChinese
              ? '在正式开放前，请勿通过非官方渠道购买或提交 API Key。'
              : 'Until the official launch, please do not buy or submit API keys through unofficial channels.'}
          </p>
          <a
            href={studioHref}
            className="btn-spatial-glow inline-flex items-center gap-2 rounded-full bg-[#3772FF] px-5 py-2.5 text-xs font-bold text-white"
          >
            {isChinese ? '先去 Studio 创作' : 'Create in Studio'}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-8 flex items-center gap-2 text-[11px] text-white/30">
          <Code2 className="h-3.5 w-3.5" />
          {isChinese ? '此页面不提供 API 文档或代码示例。' : 'This page does not provide API documentation or code samples.'}
        </div>
      </main>
    </div>
  );
}
