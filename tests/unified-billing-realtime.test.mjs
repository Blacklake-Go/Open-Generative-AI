import assert from 'node:assert/strict';
import test from 'node:test';

import { realtimeEmitter } from '../lib/ai/queue/realtimeEmitter.ts';

test('realtimeEmitter: routes events accurately to task-specific and user-specific subscribers', async () => {
  const taskEvents = [];
  const userEvents = [];

  const unsubTask = realtimeEmitter.subscribe({ taskId: 'task-100' }, (event) => {
    taskEvents.push(event);
  });

  const unsubUser = realtimeEmitter.subscribe({ userId: 'user-alice' }, (event) => {
    userEvents.push(event);
  });

  // Emit event for task-100 & user-alice
  realtimeEmitter.emit({
    taskId: 'task-100',
    userId: 'user-alice',
    status: 'PROCESSING',
    progress: 45,
    timestamp: Date.now(),
  });

  // Emit event for unrelated task-200 & user-bob
  realtimeEmitter.emit({
    taskId: 'task-200',
    userId: 'user-bob',
    status: 'COMPLETED',
    progress: 100,
    timestamp: Date.now(),
  });

  assert.equal(taskEvents.length, 1);
  assert.equal(taskEvents[0].taskId, 'task-100');
  assert.equal(taskEvents[0].progress, 45);

  assert.equal(userEvents.length, 1);
  assert.equal(userEvents[0].userId, 'user-alice');

  // Test unsubscribe
  unsubTask();
  realtimeEmitter.emit({
    taskId: 'task-100',
    userId: 'user-alice',
    status: 'COMPLETED',
    progress: 100,
    timestamp: Date.now(),
  });

  // taskEvents should still be 1 (unsubscribed), but userEvents should be 2
  assert.equal(taskEvents.length, 1);
  assert.equal(userEvents.length, 2);

  unsubUser();
});
