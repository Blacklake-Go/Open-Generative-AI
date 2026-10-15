import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchVibeMotionResultUrl,
  mapServerVibeMotionHistory,
} from '../packages/studio/src/generationHistory.js';

test('maps only completed Vibe Motion jobs with private result URLs', () => {
  const result = mapServerVibeMotionHistory([
    {
      id: 'gen_vibe_1',
      studio_id: 'vibemotion',
      status: 'succeeded',
      storage_status: 'ready',
      result_url: 'https://assets.example.test/private/vibe.mp4?signature=fresh',
      model: 'kling-2.5',
      input_summary_json: JSON.stringify({
        prompt: 'A calm camera orbit',
        parameters: { aspect_ratio: '16:9', resolution: '720p', duration: 6 },
      }),
      created_at: '2026-10-14T00:00:00.000Z',
    },
    {
      id: 'gen_other_studio',
      studio_id: 'videostudio',
      status: 'succeeded',
      storage_status: 'ready',
      result_url: 'https://assets.example.test/private/other.mp4',
    },
    {
      id: 'gen_pending',
      studio_id: 'vibemotion',
      status: 'queued',
      storage_status: 'pending',
      result_url: null,
    },
    {
      id: 'gen_without_result',
      studio_id: 'vibemotion',
      status: 'succeeded',
      storage_status: 'ready',
      result_url: '  ',
    },
  ]);

  assert.deepEqual(result, [{
    id: 'gen_vibe_1',
    requestId: 'gen_vibe_1',
    url: 'https://assets.example.test/private/vibe.mp4?signature=fresh',
    prompt: 'A calm camera orbit',
    modelId: 'kling-2.5',
    aspectRatio: '16:9',
    resolution: '720p',
    duration: 6,
    mode: 'generate',
    timestamp: '2026-10-14T00:00:00.000Z',
    canEdit: false,
  }]);
});

test('accepts object summaries and safely falls back when the summary is malformed', () => {
  const result = mapServerVibeMotionHistory([
    {
      id: 'gen_vibe_2',
      studio_id: 'VibeMotion',
      status: 'completed',
      storage_status: 'ready',
      result_url: 'https://assets.example.test/private/second.mp4',
      label: 'Fallback prompt',
      input_summary_json: { prompt: 'Object summary', parameters: { aspectRatio: '9:16', duration_seconds: 8 } },
    },
    {
      id: 'gen_vibe_3',
      studio_id: 'vibemotion',
      status: 'success',
      storage_status: 'ready',
      result_url: 'https://assets.example.test/private/third.mp4',
      label: 'Malformed summary fallback',
      input_summary_json: '{not-json',
    },
  ]);

  assert.equal(result[0].prompt, 'Object summary');
  assert.equal(result[0].aspectRatio, '9:16');
  assert.equal(result[0].duration, 8);
  assert.equal(result[1].prompt, 'Malformed summary fallback');
  assert.equal(result[1].modelId, null);
});

test('refreshes a completed private result URL through the owner-scoped creation endpoint', async () => {
  const calls = [];
  const url = await fetchVibeMotionResultUrl('gen/id 1', async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify({ creation: {
      id: 'gen/id 1',
      status: 'succeeded',
      storage_status: 'ready',
      result_url: 'https://assets.example.test/private/refreshed.mp4?signature=new',
    } }), { status: 200 });
  });

  assert.equal(url, 'https://assets.example.test/private/refreshed.mp4?signature=new');
  assert.equal(calls[0].path, '/api/generations?id=gen%2Fid%201');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('does not expose URLs from pending or failed creation rows', async () => {
  await assert.rejects(fetchVibeMotionResultUrl('gen_pending', async () => new Response(JSON.stringify({
    creation: { id: 'gen_pending', status: 'queued', storage_status: 'pending', result_url: 'https://assets.example.test/old.mp4' },
  }), { status: 200 })), /no completed private result/);
  await assert.rejects(fetchVibeMotionResultUrl('gen_missing', async () => new Response(JSON.stringify({
    creation: { id: 'gen_missing', status: 'succeeded', storage_status: 'ready', result_url: null },
  }), { status: 200 })), /Private generation result is unavailable/);
  await assert.rejects(fetchVibeMotionResultUrl('gen_external', async () => new Response(JSON.stringify({
    creation: {
      id: 'gen_external',
      status: 'succeeded',
      storage_status: 'pending',
      result_url: 'https://provider.example.test/transient.mp4',
    },
  }), { status: 200 })), /not stored as a private Asset/);
});
