/**
 * Base Model Provider Implementation
 * Provides standard parameter normalization, error mapping, and template execution flow.
 */

import type {
  IModelProvider,
  ParameterValidationResult,
  ProviderJobContext,
  ProviderJobStatus,
  ProviderSubmitResult,
  StandardMediaOutput,
} from '../contracts/provider.ts';

export abstract class BaseModelProvider implements IModelProvider {
  abstract readonly providerId: string;

  /**
   * Default parameter validator. Subclasses can override for vendor-specific constraints.
   */
  async validateParams(
    _modelId: string,
    params: Record<string, unknown>
  ): Promise<ParameterValidationResult> {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return { valid: false, normalizedParams: {}, error: '参数必须是有效的对象结构', errorCode: 'INVALID_PARAMETERS' };
    }
    return { valid: true, normalizedParams: { ...params } };
  }

  /**
   * Submit task to upstream provider. Must be implemented by concrete provider plugins.
   */
  abstract submitJob(context: ProviderJobContext): Promise<ProviderSubmitResult>;

  /**
   * Poll task status from upstream provider. Must be implemented by concrete provider plugins.
   */
  abstract pollStatus(
    providerRequestId: string,
    context: ProviderJobContext
  ): Promise<ProviderJobStatus>;

  /**
   * Normalize raw upstream response to standard media outputs.
   */
  abstract normalizeOutput(rawResponse: unknown): StandardMediaOutput[];

  /**
   * Helper to format standard error messages without leaking provider secrets or internal details.
   */
  protected normalizeProviderError(error: unknown, fallbackMessage = '供应商调用异常'): Error {
    const err = error instanceof Error ? error : new Error(String(error || fallbackMessage));
    const status = (error as { providerStatus?: number; status?: number })?.providerStatus || (error as { status?: number })?.status;
    const code = (error as { code?: string })?.code || 'PROVIDER_INTERNAL_ERROR';
    return Object.assign(err, { code, providerStatus: status });
  }
}
