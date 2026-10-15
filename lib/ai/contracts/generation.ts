/**
 * Canonical Generation Invocation Contract
 * Unifies requests from Studio, Canvas, Creative Agent, and public API into a single canonical pipeline.
 */

import type { StandardMediaOutput } from './provider.js';

export type GenerationSource = 'studio' | 'canvas' | 'agent' | 'api';

export interface MediaReferenceInput {
  role: 'reference' | 'first_frame' | 'last_frame' | 'mask' | 'control_image';
  /** Original raw string or koyo-asset: UUID */
  rawInput: string;
  /** Resolved private asset ID */
  assetId?: string;
  /** Signed readable URL or CDN direct access */
  resolvedUrl?: string;
}

export interface GenerationUserContext {
  id: string;
  email?: string;
  tier?: string;
  status?: string;
}

export interface UnifiedGenerationRequest {
  /** Caller domain attribution */
  source: GenerationSource;

  /** Authenticated user initiating the task */
  user: GenerationUserContext;

  /** Standard canonical model identity */
  modelId: string;

  /** Specific studio originating the request (e.g. 'image', 'video', 'cinema', 'canvas') */
  studioId?: string;

  /** Generation prompt text */
  prompt: string;

  /** Optional negative prompt */
  negativePrompt?: string;

  /** Normalized media references (images, masks, videos) */
  mediaReferences?: MediaReferenceInput[];

  /** Structured generation parameters (aspectRatio, resolution, duration, steps, etc.) */
  parameters: {
    aspectRatio?: string;
    resolution?: string;
    duration?: number;
    steps?: number;
    seed?: number;
    quality?: string;
    fps?: number;
    cfgScale?: number;
    [key: string]: unknown;
  };

  /** Pre-quoted quote identifier locked with cost and route snapshot */
  quoteId: string;

  /** Strict client idempotency key (8 - 200 characters) */
  idempotencyKey: string;

  /** Preferred routing mode (default: 'cost') */
  routingMode?: 'cost' | 'quality' | 'stability' | 'balanced';

  /** Canvas-specific metadata for node linking and persistence */
  canvasContext?: {
    projectId: string;
    nodeId: string;
  };
}

export type TaskLifecycleState = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface UnifiedGenerationResponse {
  taskId: string;
  status: TaskLifecycleState;
  modelId: string;
  studioId?: string;
  creditsCharged: number;
  outputs?: StandardMediaOutput[];
  resultUrl?: string | null;
  assetId?: string | null;
  providerRequestId?: string | null;
  idempotent: boolean;
  error?: {
    code: string;
    message: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}
