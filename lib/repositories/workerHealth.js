import 'server-only';

import { execute, queryOne } from '../db/index.js';

export async function recordWorkerHeartbeat({ workerName, instanceId, processId, startedAt }) {
  await execute(`
    INSERT INTO sys_core.worker_heartbeats
      (worker_name, instance_id, process_id, started_at, last_seen_at)
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (worker_name, instance_id) DO UPDATE SET
      process_id = EXCLUDED.process_id,
      last_seen_at = now()
  `, [workerName, instanceId, processId, startedAt]);
}

export async function removeWorkerHeartbeat({ workerName, instanceId }) {
  await execute('DELETE FROM sys_core.worker_heartbeats WHERE worker_name = $1 AND instance_id = $2', [workerName, instanceId]);
}

export async function readGenerationQueueHealth({ freshSeconds = 30 } = {}) {
  return queryOne(`
    WITH queue AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_count,
        MIN(created_at) FILTER (WHERE status = 'queued') AS oldest_queued_at,
        COUNT(*) FILTER (WHERE status = 'processing' AND updated_at <= now() - interval '10 minutes')::int AS stale_processing_count,
        COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= now() - interval '15 minutes')::int AS failed_last_15m
      FROM ai_studio.creations
    ), workers AS (
      SELECT
        COUNT(*) FILTER (WHERE last_seen_at >= now() - ($1::int * interval '1 second'))::int AS live_workers,
        MAX(last_seen_at) AS latest_heartbeat_at
      FROM sys_core.worker_heartbeats
      WHERE worker_name = 'generation'
    )
    SELECT queue.queued_count, queue.oldest_queued_at,
      queue.stale_processing_count, queue.failed_last_15m,
      workers.live_workers, workers.latest_heartbeat_at
    FROM queue CROSS JOIN workers
  `, [Math.max(5, Math.min(120, Number(freshSeconds) || 30))]);
}
