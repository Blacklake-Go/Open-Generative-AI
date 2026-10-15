/**
 * Provider Registry & Gateway Factory
 * Dispatches tasks to standardized IModelProvider plugins,
 * with seamless backward-compatible bridge to existing legacy adapters.
 */

import type {
  IModelProvider,
  ParameterValidationResult,
  ProviderJobContext,
  ProviderJobStatus,
  ProviderSubmitResult,
  StandardMediaOutput,
} from '../contracts/provider.ts';
import { OpenAIProviderPlugin } from './plugins/openai.plugin.ts';
import { KlingProviderPlugin } from './plugins/kling.plugin.ts';
import { VolcengineProviderPlugin } from './plugins/volcengine.plugin.ts';
import { getProviderAdapter, hasProviderAdapter } from '../../adapters/index.js';

class LegacyAdapterBridge implements IModelProvider {
  readonly providerId: string;
  private legacyAdapter: any;

  constructor(providerId: string, legacyAdapter: any) {
    this.providerId = providerId;
    this.legacyAdapter = legacyAdapter;
  }

  async validateParams(
    _modelId: string,
    params: Record<string, unknown>
  ): Promise<ParameterValidationResult> {
    return { valid: true, normalizedParams: { ...params } };
  }

  async submitJob(context: ProviderJobContext): Promise<ProviderSubmitResult> {
    const result = await this.legacyAdapter.createTask({
      providerModelId: context.providerModelId,
      prompt: context.prompt,
      parameters: context.normalizedParams,
      idempotencyKey: context.idempotencyKey,
    });

    const isDone = result.status === 'succeeded';
    const outputs: StandardMediaOutput[] = [];
    if (result.resultUrl) {
      outputs.push({
        type: 'image',
        url: result.resultUrl,
      });
    }

    return {
      providerRequestId: result.providerRequestId || String(Date.now()),
      status: isDone ? 'COMPLETED' : 'PROCESSING',
      outputs: outputs.length ? outputs : undefined,
      actualCostUsd: result.actualCostUsd,
      rawResponse: result.metadata,
    };
  }

  async pollStatus(
    providerRequestId: string,
    _context: ProviderJobContext
  ): Promise<ProviderJobStatus> {
    const status = await this.legacyAdapter.getTask(providerRequestId);
    const isDone = status.status === 'succeeded';
    const isFailed = status.status === 'failed';
    const outputs: StandardMediaOutput[] = [];
    if (status.resultUrl) {
      outputs.push({
        type: 'image',
        url: status.resultUrl,
      });
    }

    return {
      status: isDone ? 'COMPLETED' : isFailed ? 'FAILED' : 'PROCESSING',
      progress: status.progress || (isDone ? 100 : 50),
      outputs: outputs.length ? outputs : undefined,
      errorReason: status.errorReason || status.error,
    };
  }

  normalizeOutput(rawResponse: unknown): StandardMediaOutput[] {
    const resp = rawResponse as { resultUrl?: string; url?: string };
    const url = resp?.resultUrl || resp?.url;
    if (!url) return [];
    return [{ type: 'image', url }];
  }
}

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private plugins = new Map<string, IModelProvider>();

  private constructor() {
    this.registerPlugin(new OpenAIProviderPlugin());
    this.registerPlugin(new KlingProviderPlugin());
    this.registerPlugin(new VolcengineProviderPlugin());
  }

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  registerPlugin(plugin: IModelProvider): void {
    this.plugins.set(plugin.providerId.toLowerCase().trim(), plugin);
  }

  async getProvider(providerId: string, options: Record<string, unknown> = {}): Promise<IModelProvider> {
    const normId = String(providerId || '').toLowerCase().trim();
    if (this.plugins.has(normId)) {
      return this.plugins.get(normId)!;
    }

    // Seamless fallback bridge to existing legacy adapter
    if (hasProviderAdapter(normId)) {
      const legacy = await getProviderAdapter(normId, options);
      return new LegacyAdapterBridge(normId, legacy);
    }

    throw Object.assign(new Error(`未找到供应商实现: ${normId}`), {
      code: 'PROVIDER_NOT_FOUND',
    });
  }

  hasProvider(providerId: string): boolean {
    const normId = String(providerId || '').toLowerCase().trim();
    return this.plugins.has(normId) || hasProviderAdapter(normId);
  }
}

export const providerRegistry = ProviderRegistry.getInstance();
