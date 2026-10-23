import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Coins,
  ExternalLink,
  FileText,
  Film,
  GitPullRequest,
  ImageIcon,
  Music,
  Paperclip,
  UserRound,
} from 'lucide-react';
import { getFeedbackForAdmin } from '@/lib/services/feedback';
import { FEEDBACK_ATTACHMENT_KIND_LABELS, formatFeedbackBytes } from '@/lib/feedback/attachments';
import { FEEDBACK_STATUS_LABELS, findFeedbackKind } from '@/lib/feedback/catalog';
import { Card, CopyableId, PageHeader, StatusBadge } from '@/components/admin/AdminUi';
import FeedbackReviewForm from '@/components/admin/FeedbackReviewForm';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

const STATUS_TONES = { pending: 'warn', accepted: 'good', rejected: 'danger' };

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

function AttachmentIcon({ kind }) {
  if (kind === 'image') return <ImageIcon className="size-4" />;
  if (kind === 'video') return <Film className="size-4" />;
  if (kind === 'audio') return <Music className="size-4" />;
  return <FileText className="size-4" />;
}

export default async function FeedbackDetailPage({ params }) {
  await requireAdminPagePermission(PERMISSIONS.contentRead);
  const { id } = await params;
  const feedback = await getFeedbackForAdmin(id);

  if (!feedback) notFound();

  const kind = findFeedbackKind(feedback.kind);
  const pending = feedback.status === 'pending';
  const statusLabel = FEEDBACK_STATUS_LABELS[feedback.status] || feedback.status;

  return (
    <>
      <PageHeader
        eyebrow="建议与漏洞提交"
        title={feedback.title}
        description={`${kind?.label || feedback.kind} · 提交于 ${formatDate(feedback.createdAt)}`}
      >
        <Link
          href="/admin/feedback"
          className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-well px-4 py-2 text-label font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          返回列表
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-caption text-ink-muted">提交编号</p>
          <div className="mt-2">
            <CopyableId id={feedback.id} label="提交" />
          </div>
        </Card>
        <Card>
          <p className="text-caption text-ink-muted">处理状态</p>
          <div className="mt-2">
            <StatusBadge tone={STATUS_TONES[feedback.status] || 'neutral'}>{statusLabel}</StatusBadge>
          </div>
        </Card>
        <Card>
          <p className="text-caption text-ink-muted">已发硬币</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-section-title font-bold text-brand tabular-nums">
            <Coins className="size-4" />
            {feedback.rewardCoins}
          </p>
        </Card>
        <Card>
          <p className="text-caption text-ink-muted">附件数量</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-section-title font-bold text-ink tabular-nums">
            <Paperclip className="size-4 text-ink-muted" />
            {feedback.attachments.length}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-5">
            <div>
              <h2 className="text-section-title font-semibold text-ink">问题描述</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-body leading-relaxed text-ink">
                {feedback.detail}
              </p>
            </div>

            <dl className="grid gap-4 border-t border-line-subtle pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-caption text-ink-muted">涉及页面</dt>
                <dd className="mt-1 break-all font-mono text-body-sm text-ink">
                  {feedback.pageUrl || <span className="text-ink-subtle">未填写</span>}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">GitHub 链接</dt>
                <dd className="mt-1 break-all text-body-sm">
                  {feedback.githubUrl ? (
                    <a
                      href={feedback.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring inline-flex items-center gap-1 rounded-sm text-brand hover:underline"
                    >
                      {feedback.githubUrl}
                      <ExternalLink className="size-3.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-ink-subtle">未填写</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section-title font-semibold text-ink">附件</h2>
              <span className="text-caption text-ink-muted">{feedback.attachments.length} 个文件</span>
            </div>

            {feedback.attachments.length === 0 ? (
              <p className="mt-3 text-body-sm text-ink-muted">本次提交没有上传附件。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {feedback.attachments.map((attachment, index) => {
                  const preview = attachment.previewUrl || attachment.url;
                  return (
                    <li key={`${attachment.objectKey || attachment.url}-${index}`} className="rounded-xl border border-line bg-well p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {attachment.kind === 'image' && preview ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="focus-ring shrink-0 overflow-hidden rounded-lg border border-line"
                          >
                            <img src={preview} alt={attachment.name} className="size-16 object-cover" />
                          </a>
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-scrim text-ink-muted">
                            <AttachmentIcon kind={attachment.kind} />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-medium text-ink">{attachment.name}</p>
                          <p className="text-caption text-ink-muted">
                            {FEEDBACK_ATTACHMENT_KIND_LABELS[attachment.kind] || '文件'} · {formatFeedbackBytes(attachment.sizeBytes)}
                          </p>
                        </div>
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-label font-semibold text-ink-muted transition-colors hover:border-brand-line hover:text-brand"
                        >
                          下载
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>

                      {attachment.kind === 'video' && (
                        <video
                          src={attachment.url}
                          poster={attachment.previewUrl || undefined}
                          controls
                          preload="metadata"
                          className="mt-3 w-full rounded-lg border border-line"
                        />
                      )}
                      {attachment.kind === 'audio' && (
                        <audio src={attachment.url} controls preload="metadata" className="mt-3 w-full" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-card-title font-semibold text-ink">提交人</h2>
            <div className="mt-3 space-y-2 text-body-sm">
              <p className="flex items-start gap-2 break-all text-ink">
                <UserRound className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                {feedback.userEmail || '—'}
              </p>
              {feedback.userNumber && (
                <p className="text-ink-muted">用户编号 {feedback.userNumber}</p>
              )}
              <p className="text-ink-muted">提交于 {formatDate(feedback.createdAt)}</p>
              <Link
                href={`/admin/users/${feedback.userId}`}
                className="focus-ring inline-flex items-center gap-1 rounded-sm text-label font-semibold text-brand hover:underline"
              >
                查看用户详情
                <ExternalLink className="size-3.5" />
              </Link>
            </div>
          </Card>

          {pending ? (
            <Card>
              <h2 className="text-card-title font-semibold text-ink">审核裁决</h2>
              <p className="mt-1 text-caption leading-relaxed text-ink-muted">
                采纳会立即发放硬币并通知提交人；裁决写入审计日志，提交后不可撤销。
              </p>
              <div className="mt-4">
                <FeedbackReviewForm
                  feedbackId={feedback.id}
                  defaultReward={kind?.rewardDefault || 0}
                />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-card-title font-semibold text-ink">审核结果</h2>
                <StatusBadge tone={STATUS_TONES[feedback.status] || 'neutral'}>{statusLabel}</StatusBadge>
              </div>
              <dl className="mt-3 space-y-2.5 text-body-sm">
                <div>
                  <dt className="text-caption text-ink-muted">审核人</dt>
                  <dd className="mt-0.5 break-all text-ink">{feedback.reviewerEmail || '—'}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">审核时间</dt>
                  <dd className="mt-0.5 text-ink">{formatDate(feedback.reviewedAt)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">发放硬币</dt>
                  <dd className="mt-0.5 text-brand tabular-nums">{feedback.rewardCoins} 枚</dd>
                </div>
                {feedback.rewardTransactionId && (
                  <div>
                    <dt className="text-caption text-ink-muted">奖励流水</dt>
                    <dd className="mt-1">
                      <CopyableId id={feedback.rewardTransactionId} label="流水" />
                    </dd>
                  </div>
                )}
              </dl>
              {feedback.reviewNote && (
                <div className="mt-4 rounded-xl border border-line bg-well px-3 py-2.5">
                  <p className="text-caption font-medium text-ink-muted">审核备注</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-body-sm leading-relaxed text-ink">
                    {feedback.reviewNote}
                  </p>
                </div>
              )}
            </Card>
          )}

          <Card>
            <h2 className="text-card-title font-semibold text-ink">流程提示</h2>
            <ul className="mt-3 space-y-2 text-body-sm leading-relaxed text-ink-muted">
              <li className="flex items-start gap-2">
                <GitPullRequest className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
                安全类提交请先确认影响面，避免在公开 Issue 中披露可利用细节。
              </li>
              <li className="flex items-start gap-2">
                <Coins className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
                奖励数量可按实际价值调整，采纳后立即入账且不可重复发放。
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
