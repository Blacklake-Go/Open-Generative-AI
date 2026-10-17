import Link from 'next/link';
import StudioHeader, { PageEyebrow } from '@/components/site/StudioHeader';

export const metadata = { title: '隐私政策 | supdance' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-canvas text-white flex flex-col">
      <StudioHeader title="法律合规" subtitle="数据隐私与用户信息保护政策" />
      
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/[0.08] bg-surface/80 p-6 sm:p-10 shadow-2xl backdrop-blur-md">
          <div className="border-b border-white/[0.08] pb-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <PageEyebrow>Privacy & Security</PageEyebrow>
              <span className="text-xs text-gray-500 font-mono">v2.5 · 2026-10-17</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              <span className="font-jost font-medium">supdance</span> 平台隐私保护政策
            </h1>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              <span className="font-jost font-medium">supdance</span> 深知个人隐私及生成创意数据对创作者的重要性。本政策旨在透明阐述我们如何收集、加密存储、保护以及处理您的账户凭据与任务数据。
            </p>
          </div>

          <section className="space-y-8 text-sm leading-relaxed text-gray-300">
            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                1. 数据收集与最小必要原则
              </h2>
              <p className="text-gray-400">
                我们仅出于向您提供服务所必需收集信息：包括注册登录使用的邮箱或手机号、生成任务的历史输入参数（Prompt、分辨率、步数）、生成产物地址以及支付对账订单信息。我们严格执行银行级单向哈希加密存储密码。
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                2. 上游模型供应商交互安全
              </h2>
              <p className="text-gray-400">
                当您提交生成任务时，必要的提示词与参考图片将通过安全加密通道（TLS 1.3）传输至对应的算力集群或模型供应商。我们不会将用户专有私密资产或输入用于未经授权的公开模型通用训练。
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                3. Cookie 与会话令牌保护
              </h2>
              <p className="text-gray-400">
                平台采用具备 HttpOnly 与 SameSite 保护的会话 Cookie，支持全站同源防御（CSRF 请求门禁）。创作者可随时在账户中心安全注销登录或下线特定设备活跃会话。
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                4. 创作者数据权利与账户注销
              </h2>
              <p className="text-gray-400">
                创作者拥有对其资产数据的完整知情权与删除权。您可以在个人作品中心随时导出、下架或彻底物理删除历史创作记录，或联系技术支持申请注销账户。
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-base/60 p-5">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                5. SupDance Canvas Codex 插件与本地 Agent
              </h2>
              <div className="space-y-3 text-gray-400">
                <p>
                  使用 SupDance Canvas Codex 插件时，您设备上的本地 Agent 会按您的请求读取或操作当前画布，因此可能处理画布标题、节点内容、选中内容、提示词、参考素材及完成连接和任务所需的 Agent 运行数据。相关信息用于建立画布连接、读取或编辑画布，以及执行您请求的工作流。只有在您请求生成内容时，必要的提示词、参考素材和任务参数才会发送给该任务所选的模型或算力服务商。
                </p>
                <p>
                  SupDance 服务端对通过此插件接收的画布内容、提示词及 Agent 运行数据保留 3 天，期限届满后自动删除。此期限只适用于 SupDance 服务端保存的数据，不适用于您设备上由 Codex 或本地 Agent 保存的会话记录、任务历史、配置和调试日志；本机数据会保留到您或本机软件设置将其删除。您可以停止使用插件，并通过 SupDance 账户提供的画布和资产管理功能删除在线内容。
                </p>
                <p lang="en">
                  When you use the SupDance Canvas Codex plugin, its local Agent processes canvas titles, node content, selected content, prompts, reference media, and Agent runtime data as needed to connect to, read, or edit the canvas and to run workflows you request. When you request content generation, the prompt, reference media, and task parameters needed for that request are sent to the model or compute provider selected for that task. SupDance retains plugin-related canvas content, prompts, and Agent runtime data received by SupDance for 3 days, then automatically deletes them. This server-side period does not apply to Codex or local Agent session records, task history, configuration, or debug logs stored on your device; local data remains until you or your local software settings delete it. You can stop using the plugin and delete online canvas content through the canvas and asset controls available in your SupDance account.
                </p>
              </div>
            </div>
          </section>

          {/* 底部法律导航联动 */}
          <div className="mt-10 pt-6 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs text-gray-500">
            <div>© 2026 <span className="font-jost font-medium">supdance</span> · 保留所有权利</div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-cyan-400 transition-colors">服务条款</Link>
              <Link href="/refund" className="hover:text-cyan-400 transition-colors">退款政策</Link>
              <Link href="/content-policy" className="hover:text-cyan-400 transition-colors">内容安全准则</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
