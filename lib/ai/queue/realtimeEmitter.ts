/**
 * Realtime Event Emitter
 * In-process decoupled pub/sub channel for streaming generation task status to SSE or WebSockets.
 */

import { EventEmitter } from 'node:events';
import type { IRealtimeEmitter, TaskRealtimeEvent } from '../contracts/realtime.js';

class InMemoryRealtimeEmitter implements IRealtimeEmitter {
  private emitter = new EventEmitter();

  constructor() {
    // High concurrency listeners capacity
    this.emitter.setMaxListeners(1000);
  }

  emit(event: TaskRealtimeEvent): void {
    // 1. Emit to specific task channel
    if (event.taskId) {
      this.emitter.emit(`task:${event.taskId}`, event);
    }
    // 2. Emit to user channel (for notification center / dashboard)
    if (event.userId) {
      this.emitter.emit(`user:${event.userId}`, event);
    }
    // 3. Global broadcast
    this.emitter.emit('task:event', event);
  }

  subscribe(
    filter: { userId?: string; taskId?: string },
    listener: (event: TaskRealtimeEvent) => void
  ): () => void {
    let channel = 'task:event';
    if (filter.taskId) {
      channel = `task:${filter.taskId}`;
    } else if (filter.userId) {
      channel = `user:${filter.userId}`;
    }

    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}

export const realtimeEmitter = new InMemoryRealtimeEmitter();
