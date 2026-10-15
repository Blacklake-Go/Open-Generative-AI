/**
 * Realtime Event Streaming Contract
 * Replaces repetitive client-side polling with resilient Server-Sent Events (SSE) or WebSockets.
 */

import type { StandardMediaOutput } from './provider.js';
import type { TaskLifecycleState } from './generation.js';

export interface TaskRealtimeEvent {
  taskId: string;
  userId: string;
  status: TaskLifecycleState;
  progress?: number; // 0 - 100 percentage
  outputs?: StandardMediaOutput[];
  resultUrl?: string | null;
  assetId?: string | null;
  error?: {
    code: string;
    message: string;
  } | null;
  timestamp: number;
}

export interface IRealtimeEmitter {
  /**
   * Broadcast state update to subscribed clients
   */
  emit(event: TaskRealtimeEvent): void;

  /**
   * Register a subscriber listener for a specific user or task
   */
  subscribe(filter: { userId?: string; taskId?: string }, listener: (event: TaskRealtimeEvent) => void): () => void;
}
