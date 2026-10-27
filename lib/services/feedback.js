import 'server-only';

import { withTransaction, randomId } from '../db/index.js';
import { grantFeedbackRewardCoins } from '../financial/currencyService.js';
import { findFeedbackKind } from '../feedback/catalog.js';
import { normalizeGithubUrl, validateFeedbackAttachments } from '../feedback/attachments.js';
import { getAssetStorageAdapter, getStorageConfigAndAdapter, ingestBuffer } from '../storage/storageService.js';
import { logAudit } from '../admin/audit.js';
import {
  claimFeedbackReview,
  findFeedbackById,
  findFeedbackDetailForAdmin,
  insertFeedbackReport,
  listFeedbackByUser,
  pageFeedbackForAdmin,
} from '../repositories/feedback.js';

const MAX_TITLE = 200;
const MAX_DETAIL = 4000;

function sanitizeSubmit({ kind, title, pageUrl, detail, githubUrl }) {
  const resolved = findFeedbackKind(kind);
  if (!resolved) return { error: '提交类型无效，请重新选择' };

  const cleanTitle = String(title || '').trim().slice(0, MAX_TITLE);
  const cleanDetail = String(detail || '').trim().slice(0, MAX_DETAIL);
  const cleanPageUrl = String(pageUrl || '').trim().slice(0, 500);
  const github = normalizeGithubUrl(githubUrl);

  if (cleanTitle.length < 5) return { error: '请填写不少于 5 个字的标题，方便定位问题' };
  if (cleanDetail.length < 20) return { error: '描述不少于 20 个字，请写清复现步骤或改进理由' };
  if (github.error) return { error: github.error };

  return {
    kind: resolved,
    title: cleanTitle,
    detail: cleanDetail,
    pageUrl: cleanPageUrl || null,
    githubUrl: github.url,
  };
}

function storageFailure(error) {
  const code = error?.code || 'FEEDBACK_ATTACHMENT_UPLOAD_FAILED';
  if (code === 'STORAGE_FILE_TOO_LARGE') return { error: '附件超过大小限制，请压缩后重试', code, status: 413 };
  if (code === 'STORAGE_FILE_TYPE_INVALID') return { error: '附件类型不受支持，请更换文件', code, status: 415 };
  return { error: '附件上传失败，请稍后再试', code, status: 503 };
}

async function discardStoredAttachments(attachments) {
  if (!attachments.length) return;
  try {
    await Promise.all(attachments.map(async (item) => {
      const keys = [item.objectKey, item.previewObjectKey, item.thumbnailObjectKey].filter(Boolean);
      if (!keys.length) return;
      const adapter = await getAssetStorageAdapter({
        provider: item.provider,
        locationId: item.storageLocationId,
      }).catch(() => null);
      if (!adapter) return;
      await Promise.all(keys.map((key) => adapter.delete({ key }).catch(() => {})));
    }));
  } catch {
    // 清理失败只影响存储占用，不能覆盖用户看到的原始错误。
  }
}

export async function submitFeedback({ userId, files = [], ...input }) {
  const payload = sanitizeSubmit(input);
  if (payload.error) return { error: payload.error };

  const attachmentCheck = validateFeedbackAttachments(files);
  if (attachmentCheck.error) {
    return { error: attachmentCheck.error, code: 'FEEDBACK_ATTACHMENT_INVALID', status: 400 };
  }

  const uploaded = [];
  try {
    for (const item of attachmentCheck.items) {
      let buffer;
      try {
        buffer = Buffer.from(await item.file.arrayBuffer());
      } catch {
        await discardStoredAttachments(uploaded);
        return { error: `无法读取附件 ${item.name}，请重新选择`, code: 'FEEDBACK_ATTACHMENT_READ_FAILED', status: 400 };
      }

      const stored = await ingestBuffer({
        body: buffer,
        userId,
        type: item.storageType,
        filename: item.name,
        contentType: item.mimeType,
        sourceType: 'feedback_attachment',
        visibility: 'private',
      });

      uploaded.push({
        objectKey: stored.objectKey,
        previewObjectKey: stored.previewObjectKey || null,
        thumbnailObjectKey: stored.thumbnailObjectKey || null,
        provider: stored.provider || null,
        storageLocationId: stored.storageLocationId || null,
        url: stored.url,
        name: item.name,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        kind: item.kind,
      });
    }

    if (uploaded.some((item) => item.previewObjectKey)) {
      const { storage } = await getStorageConfigAndAdapter();
      for (const item of uploaded) {
        const previewKey = item.previewObjectKey || item.thumbnailObjectKey;
        if (previewKey) item.previewUrl = storage.getUrl({ key: previewKey });
      }
    }

    const attachments = uploaded.map((item) => ({
      objectKey: item.objectKey,
      url: item.url,
      previewUrl: item.previewUrl || null,
      provider: item.provider || null,
      storageLocationId: item.storageLocationId || null,
      name: item.name,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      kind: item.kind,
    }));

    const id = randomId('fb');
    await insertFeedbackReport({
      id,
      userId,
      kind: payload.kind.id,
      title: payload.title,
      pageUrl: payload.pageUrl,
      githubUrl: payload.githubUrl,
      detail: payload.detail,
      attachments,
    });

    return { feedbackId: id, kind: payload.kind.id, attachmentCount: attachments.length };
  } catch (error) {
    await discardStoredAttachments(uploaded);
    if (String(error?.code || '').startsWith('STORAGE_')) return storageFailure(error);
    throw error;
  }
}

export async function listMyFeedback(userId, { limit = 20, offset = 0 } = {}) {
  const rows = await listFeedbackByUser(userId, { limit, offset });
  return rows.map(mapRow);
}

/**
 * 审核并结清硬币奖励。采纳时按管理员裁定的数量发放，一笔建议最多发放一次：
 * 发放本身以 feedback:<id>:reward 作为幂等键记账，重复裁决只会命中已有分录。
 */
export async function reviewFeedback({ actor, feedbackId, resolution, rewardCoins, note, requestId }) {
  if (!['accepted', 'rejected'].includes(resolution)) {
    return { error: '审核结论无效' };
  }

  const existing = await findFeedbackById(feedbackId);
  if (!existing) return { error: '提交记录不存在' };
  if (existing.status !== 'pending') return { error: '该提交已审核，不能重复裁决' };

  let amount = 0;
  let rewardTransactionId = null;

  if (resolution === 'accepted') {
    const fallback = findFeedbackKind(existing.kind)?.rewardDefault ?? 0;
    amount = Number.isFinite(Number(rewardCoins)) && Number(rewardCoins) > 0 ? Number(rewardCoins) : fallback;
    if (amount <= 0) return { error: '采纳需要填写发放数量' };

    const granted = await grantFeedbackRewardCoins({
      userId: existing.user_id,
      feedbackId: existing.id,
      amount,
      note: `采纳建议《${existing.title.slice(0, 30)}》发放硬币奖励`,
    });
    rewardTransactionId = granted.transactionId;
  }

  const updated = await withTransaction(async (tx) => {
    const row = await claimFeedbackReview({
      feedbackId,
      resolution,
      rewardCoins: resolution === 'accepted' ? amount : 0,
      reviewerId: actor.id,
      note: String(note || '').slice(0, 500) || null,
      rewardTransactionId: rewardTransactionId || null,
      tx,
    });
    if (!row) return null;

    await logAudit({
      actor,
      action: 'feedback.review',
      targetType: 'feedback_report',
      targetId: feedbackId,
      riskLevel: 'medium',
      before: { status: existing.status },
      after: { status: resolution, rewardCoins: amount, note },
      requestId,
      transaction: tx,
    });
    return row;
  });

  if (!updated) return { error: '该提交已被其他管理员处理，请刷新后重试' };
  return { feedback: mapRow(updated), rewardedCoins: amount };
}

function parseAttachments(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return list
    .filter((item) => item && typeof item === 'object' && item.url)
    .map((item) => ({
      objectKey: item.objectKey || null,
      url: item.url,
      previewUrl: item.previewUrl || null,
      provider: item.provider || null,
      storageLocationId: item.storageLocationId || null,
      name: String(item.name || '附件'),
      mimeType: item.mimeType || '',
      sizeBytes: Number(item.sizeBytes || 0),
      kind: item.kind || 'file',
    }));
}

function mapRow(row) {
  const attachments = parseAttachments(row.attachments);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    pageUrl: row.page_url,
    githubUrl: row.github_url || null,
    detail: row.detail,
    status: row.status,
    rewardCoins: Number(row.reward_coins || 0),
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    userId: row.user_id,
    userEmail: row.email,
    attachments,
    attachmentCount: Number(row.attachment_count ?? attachments.length),
  };
}

export async function getFeedbackForAdmin(feedbackId) {
  const row = await findFeedbackDetailForAdmin(feedbackId);
  if (!row) return null;
  return {
    ...mapRow(row),
    userNumber: row.user_number,
    userAvatarUrl: row.avatar_url,
    reviewerId: row.reviewer_id,
    reviewerEmail: row.reviewer_email,
    rewardTransactionId: row.reward_transaction_id,
  };
}

export async function listFeedbackForAdmin(searchParams) {
  return pageFeedbackForAdmin(searchParams);
}
