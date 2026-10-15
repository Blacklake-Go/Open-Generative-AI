/**
 * Canonical Generation Pipeline
 * The unified orchestration pipeline executing all generation requests across Studio, Canvas, and Agent.
 * Enforces prompt moderation, provider parameter normalization, two-phase credit settlement, and real-time events.
 */

import type {
  UnifiedGenerationRequest,
  UnifiedGenerationResponse,
} from '../contracts/generation.ts';
import { providerRegistry } from '../providers/registry.ts';
import { twoPhaseBilling } from '../billing/twoPhaseSettlement.ts';
import { realtimeEmitter } from '../queue/realtimeEmitter.ts';
import { validatePromptSafety } from '../../security/contentModeration.js';
import { verifyAndConsumeQuote } from '../../services/pricingEngine.js';
import { createGenerationTask, processGenerationTask } from '../../services/generationCore.js';
import { linkCanvasProjectJob } from '../../repositories/canvasProjects.js';
import { getAssetUrl } from '../../storage/storageService.js';
import { exposeCreationResult } from '../../services/generations.js';

export class CanonicalGenerationPipeline {
  static async execute(request: UnifiedGenerationRequest): Promise<UnifiedGenerationResponse> {
    if (!request.user?.id) {
      throw Object.assign(new Error('未通过身份认证'), { code: 'UNAUTHENTICATED' });
    }

    if (!request.modelId) {
      throw Object.assign(new Error('必须提供生成模型标识'), { code: 'MODEL_ID_REQUIRED' });
    }

    if (!request.quoteId) {
      throw Object.assign(new Error('创建生成任务前必须先取得有效的服务端报价'), { code: 'QUOTE_REQUIRED' });
    }

    // 1. Content Moderation
    const moderation = validatePromptSafety(request.prompt);
    if (!moderation.passed) {
      throw Object.assign(new Error(moderation.reason), { code: moderation.code || 'CONTENT_POLICY_VIOLATION' });
    }

    // 2. Provider parameter normalization
    const provider = await providerRegistry.getProvider(request.modelId);
    const paramValidation = await provider.validateParams(request.modelId, request.parameters);
    if (!paramValidation.valid) {
      throw Object.assign(new Error(paramValidation.error || '生成参数校验未通过'), {
        code: paramValidation.errorCode || 'INVALID_PARAMETERS',
      });
    }

    // 3. Delegate to core with transactional creation and canvas linking
    const task = await createGenerationTask({
      user: request.user,
      modelId: request.modelId,
      studioId: request.studioId || (request.source === 'canvas' ? 'canvas' : 'studio'),
      prompt: request.prompt,
      parameters: paramValidation.normalizedParams,
      quoteParameters: request.parameters,
      idempotencyKey: request.idempotencyKey,
      label: `${request.modelId} · ${request.source.toUpperCase()}`,
      quoteId: request.quoteId,
      routingMode: request.routingMode || 'cost',
      onTaskCreated: request.canvasContext ? async ({ creation, transaction }) => {
        await linkCanvasProjectJob(request.user.id, {
          projectId: request.canvasContext!.projectId,
          nodeId: request.canvasContext!.nodeId,
          jobId: creation.id,
          modelId: request.modelId,
          idempotencyKey: request.idempotencyKey,
        }, { transaction });
      } : undefined,
    });

    const creation = task.creation;

    // Emit initial QUEUED event
    realtimeEmitter.emit({
      taskId: creation.id,
      userId: request.user.id,
      status: 'QUEUED',
      progress: 0,
      timestamp: Date.now(),
    });

    // Idempotent hit: return existing state
    if (task.idempotent && creation.status !== 'queued') {
      const exposed = await exposeCreationResult(creation);
      return {
        taskId: creation.id,
        status: creation.status === 'succeeded' ? 'COMPLETED' : creation.status === 'failed' ? 'FAILED' : 'PROCESSING',
        modelId: request.modelId,
        studioId: creation.studio_id,
        creditsCharged: Number(creation.credit_cost || 0),
        resultUrl: exposed.result_url,
        assetId: creation.asset_id || null,
        providerRequestId: creation.provider_request_id || null,
        idempotent: true,
        createdAt: creation.created_at,
        updatedAt: creation.updated_at,
      };
    }

    // Async mode: return immediately in 202 queued
    if (process.env.GENERATION_ASYNC === 'true') {
      return {
        taskId: creation.id,
        status: 'QUEUED',
        modelId: request.modelId,
        studioId: creation.studio_id,
        creditsCharged: Number(creation.credit_cost || 0),
        resultUrl: null,
        assetId: null,
        providerRequestId: creation.provider_request_id || null,
        idempotent: Boolean(task.idempotent),
        createdAt: creation.created_at,
        updatedAt: creation.updated_at,
      };
    }

    // Process synchronous generation
    realtimeEmitter.emit({
      taskId: creation.id,
      userId: request.user.id,
      status: 'PROCESSING',
      progress: 30,
      timestamp: Date.now(),
    });

    const processed = await processGenerationTask({ creationId: creation.id });
    const finalCreation = processed.creation || creation;
    const isSuccess = processed.success !== false && finalCreation.status === 'succeeded';
    const exposed = await exposeCreationResult(finalCreation);

    const terminalStatus = isSuccess ? 'COMPLETED' : processed.pending ? 'PROCESSING' : 'FAILED';

    // Broadcast terminal state
    realtimeEmitter.emit({
      taskId: finalCreation.id,
      userId: request.user.id,
      status: terminalStatus,
      progress: isSuccess ? 100 : undefined,
      resultUrl: exposed.result_url,
      assetId: finalCreation.asset_id,
      error: !isSuccess && processed.error ? { code: 'GENERATION_FAILED', message: processed.error } : null,
      timestamp: Date.now(),
    });

    return {
      taskId: finalCreation.id,
      status: terminalStatus,
      modelId: request.modelId,
      studioId: finalCreation.studio_id,
      creditsCharged: isSuccess ? Number(finalCreation.credit_cost || 0) : 0,
      resultUrl: exposed.result_url || null,
      assetId: finalCreation.asset_id || null,
      providerRequestId: processed.providerRequestId || finalCreation.provider_request_id || null,
      idempotent: Boolean(task.idempotent),
      error: !isSuccess && processed.error ? { code: 'GENERATION_FAILED', message: processed.error } : null,
      createdAt: finalCreation.created_at,
      updatedAt: finalCreation.updated_at,
    };
  }
}

export const canonicalPipeline = CanonicalGenerationPipeline;
