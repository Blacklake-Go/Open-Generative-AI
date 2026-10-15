import Link from 'next/link';
import StudioHeader, { PageEyebrow } from '@/components/site/StudioHeader';

export const metadata = { title: '内容安全准则与合规使用规范 | supdance' };

export default function ContentPolicyPage() {
  return (
    <div className="min-h-screen bg-canvas text-white flex flex-col">
      <StudioHeader title="法律合规" subtitle="AI 创作合规与内容安全准则" />
      
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/[0.08] bg-surface/80 p-6 sm:p-10 shadow-2xl backdrop-blur-md">
          <div className="border-b border-white/[0.08] pb-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <PageEyebrow>Responsible AI & Safety</PageEyebrow>
              <span className="text-xs text-gray-500 font-mono">v2.4 · 2026-09-16</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              <span className="font-jost font-medium">supdance</span> 内容安全与合规守则
            </h1>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              我们致力于构建负责任的生成式人工智能基础设施。平台依托智能审核流水线与人工复审双层机制，严厉打击各类违法违规滥用行为。
            </p>
          </div>

          <section className="space-y-8 text-sm leading-relaxed text-gray-300">
            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                1. 零容忍违禁内容范畴
              </h2>
              <p className="text-gray-400">
                严禁利用任何文本生图、图生视频、声音克隆等模型生成或诱导生成以下内容：儿童色情与侵害（CSAM）、恐怖主义与极端暴力、制作危险武器或危险化学品指南、非自愿深度伪造（Deepfake）诽谤或侵犯他人肖像隐私、欺诈钓鱼及恶意代码。
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                2. 多级自动化机审与实时熔断
              </h2>
              <p className="text-gray-400">
                系统在任务接入层执行严格的前置敏感词语义过滤与上游视觉合规拦截。触发严重违规的请求将被实时熔断阻断，且相关安全日志将被持久化保存用于违规追责。
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                3. 社区监督与快速申诉通道
              </h2>
              <p className="text-gray-400">
                即梦社区开放用户实时一键举报入口。如您发现他人公开的作品涉嫌侵权或违规，可随时提交举报。被下架创作者如有异议，可通过工单系统提交合法权属证明发起复议。
              </p>
            </div>
          </section>

          {/* 底部法律导航联动 */}
          <div className="mt-10 pt-6 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs text-gray-500">
            <div>© 2026 <span className="font-jost font-medium">supdance</span> · 保留所有权利</div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-cyan-400 transition-colors">服务条款</Link>
              <Link href="/privacy" className="hover:text-cyan-400 transition-colors">隐私政策</Link>
              <Link href="/refund" className="hover:text-cyan-400 transition-colors">退款政策</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
