/**
 * Standard Model Provider Gateway Contract
 * All downstream AI providers (OpenAI, Kling, Volcengine, Minimax, RunningHub, MuAPI, etc.)
 * must implement this contract to decouple provider-specific formats from core generation dispatch.
 */

export interface StandardMediaOutput {
  type: 'image' | 'video' | 'audio' | 'text';
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  fileSizeBytes?: number;
}

export interface ProviderJobContext {
  modelId: string;
  providerModelId: string;
  prompt: string;
  negativePrompt?: string;
  normalizedParams: Record<string, unknown>;
  idempotencyKey: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export type ProviderJobExecutionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ProviderSubmitResult {
  providerRequestId: string;
  status: ProviderJobExecutionStatus;
  /** Populated immediately if the provider supports synchronous completion */
  outputs?: StandardMediaOutput[];
  actualCostUsd?: number | null;
  rawResponse?: unknown;
}

export interface ProviderJobStatus {
  status: ProviderJobExecutionStatus;
  progress?: number; // 0 - 100 percentage
  outputs?: StandardMediaOutput[];
  errorCode?: string;
  errorReason?: string;
  actualCostUsd?: number | null;
  rawResponse?: unknown;
}

export interface ParameterValidationResult {
  valid: boolean;
  normalizedParams: Record<string, unknown>;
  error?: string;
  errorCode?: string;
}

export interface IModelProvider {
  /** Unique provider identity (e.g. 'openai', 'volcengine', 'kling', 'runninghub', 'muapi') */
  readonly providerId: string;

  /**
   * 1. Validate & normalize incoming parameters into provider-specific format
   * Prevents provider-specific field quirks from leaking into higher layers.
   */
  validateParams(
    modelId: string,
    params: Record<string, unknown>
  ): Promise<ParameterValidationResult>;

  /**
   * 2. Submit task to upstream provider API
   * Handles authentication, endpoint resolution, idempotency, and network error mapping.
   */
  submitJob(context: ProviderJobContext): Promise<ProviderSubmitResult>;

  /**
   * 3. Poll or query upstream task status
   */
  pollStatus(
    providerRequestId: string,
    context: ProviderJobContext
  ): Promise<ProviderJobStatus>;

  /**
   * 4. Normalize raw upstream response into uniform media outputs
   */
  normalizeOutput(rawResponse: unknown): StandardMediaOutput[];
}
