/**
 * Two-Phase Financial Settlement Contract
 * Guarantees atomic credit balance reservation, commit on successful archival,
 * and 100% void / rollback on any provider or storage failure.
 */

export interface ReserveCreditsParams {
  userId: string;
  amount: number;
  modelId: string;
  studioId?: string;
  quoteId: string;
  idempotencyKey: string;
}

export interface ReservationResult {
  reservationId: string;
  amount: number;
  bucketSplit: {
    dailyFree: number;
    subscription: number;
    perpetual: number;
  };
  expiresAt: string;
}

export interface CommitCreditsParams {
  reservationId: string;
  creationId: string;
  actualCostUsd?: number | null;
  providerId?: string;
  modelId?: string;
}

export interface RollbackCreditsParams {
  reservationId: string;
  expectedUserId: string;
  reason: string;
  errorCode?: string;
}

export interface ITwoPhaseBillingLifecycle {
  /**
   * Phase 1: Lock wallet row, deduct from available FIFO buckets, increment frozen_credits
   */
  reserve(params: ReserveCreditsParams): Promise<ReservationResult>;

  /**
   * Phase 2a: Finalize settlement when generation and storage archival succeed
   */
  commit(params: CommitCreditsParams): Promise<void>;

  /**
   * Phase 2b: Immediate 100% refund. Restore exact bucket amounts and release frozen_credits
   */
  rollback(params: RollbackCreditsParams): Promise<void>;
}
