import test from 'node:test';
import assert from 'node:assert/strict';

test('hosted motion graphics quotes and creates a job with the selected canonical model ID', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCustomEvent = globalThis.CustomEvent;
  const calls = [];
  const storageValues = new Map();
  globalThis.window = {
    location: { protocol: 'https:', search: '', pathname: '/studio/vibemotion' },
    sessionStorage: {
      getItem: (key) => storageValues.get(key) || null,
      setItem: (key, value) => storageValues.set(key, value),
      removeItem: (key) => storageValues.delete(key),
    },
    dispatchEvent() {},
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method || 'GET', body });
    if (path === '/api/generation/quote') {
      return new Response(JSON.stringify({ quoteId: 'quote_test_1', creditsQuoted: 3 }), { status: 200 });
    }
    if (path === '/api/generations' && options.method === 'POST') {
      return new Response(JSON.stringify({ creation: { id: 'generation_test_1', status: 'queued' } }), { status: 202 });
    }
    if (path.startsWith('/api/generations?id=')) {
      return new Response(JSON.stringify({ creation: {
        id: 'generation_test_1',
        status: 'succeeded',
        result_url: 'https://assets.example.test/private/result.mp4',
        credit_cost: 3,
      } }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${path}`);
  };

  try {
    const { generateImage, generateI2I, generateVideo, runMotionGraphics, runMotionGraphicsEdit } = await import(
      '../packages/studio/src/muapi.js?hosted-motion-graphics-test'
    );

    await assert.rejects(
      runMotionGraphics(null, { prompt: 'test prompt' }),
      /Choose a currently available video model/,
    );
    assert.equal(calls.length, 0, 'missing model selection must not quote or create a job');

    const result = await runMotionGraphics(null, {
      modelId: 'seedance-2.0',
      studioId: 'vibemotion',
      prompt: 'test prompt',
      task_type: 't2v',
      aspect_ratio: '16:9',
      resolution: '720p',
      duration: 6,
      duration_seconds: 6,
    });

    const quoteRequest = calls.find((call) => call.path === '/api/generation/quote');
    const createRequest = calls.find((call) => call.path === '/api/generations' && call.method === 'POST');
    assert.equal(quoteRequest.body.modelId, 'seedance-2.0');
    assert.equal(createRequest.body.modelId, 'seedance-2.0');
    assert.equal(quoteRequest.body.parameters.resolution, '720p');
    assert.equal(createRequest.body.studioId, 'vibemotion');
    assert.equal(createRequest.body.parameters.task_type, 't2v');
    assert.equal(createRequest.body.parameters.resolution, '720p');
    assert.equal(createRequest.body.parameters.duration, 6);
    assert.equal(result.request_id, 'generation_test_1');
    assert.equal(result.url, 'https://assets.example.test/private/result.mp4');
    assert.equal(calls.some((call) => call.path.includes('/api/v1/motion-graphics')), false);

    const beforeVideoSubmit = calls.length;
    await generateVideo(null, {
      model: 'seedance-2.0',
      studioId: 'video',
      prompt: 'test prompt',
      task_type: 't2v',
      aspect_ratio: '16:9',
      resolution: '720p',
      duration: 6,
    });
    const videoRequests = calls.slice(beforeVideoSubmit);
    const videoQuote = videoRequests.find((call) => call.path === '/api/generation/quote');
    const videoCreate = videoRequests.find((call) => call.path === '/api/generations' && call.method === 'POST');
    assert.equal(videoQuote.body.parameters.task_type, 't2v');
    assert.equal(videoQuote.body.parameters.resolution, '720p');
    assert.equal(videoCreate.body.parameters.task_type, 't2v');
    assert.equal(videoCreate.body.parameters.duration, 6);

    const imageParameters = {
      task_type: 't2i',
      prompt: 'approved image prompt',
      aspect_ratio: '3:2',
      resolution: '2K',
      negative_prompt: 'declared only',
    };
    const beforeImageSubmit = calls.length;
    await generateImage(null, {
      model: 'seedream-5.0',
      studioId: 'image',
      prompt: 'stale client prompt',
      public_parameters: imageParameters,
    });
    const imageRequests = calls.slice(beforeImageSubmit);
    const imageQuote = imageRequests.find((call) => call.path === '/api/generation/quote');
    const imageCreate = imageRequests.find((call) => call.path === '/api/generations' && call.method === 'POST');
    assert.deepEqual(imageQuote.body.parameters, imageParameters);
    assert.deepEqual(imageCreate.body.parameters, imageParameters);

    const imageToImageParameters = {
      task_type: 'i2i',
      prompt: 'approved image edit',
      image_url: 'https://assets.example.test/private/source.png',
      quality: 'high',
    };
    const beforeImageEditSubmit = calls.length;
    await generateI2I(null, {
      model: 'seedream-5.0',
      studioId: 'image',
      images_list: [imageToImageParameters.image_url],
      image_url: imageToImageParameters.image_url,
      public_parameters: imageToImageParameters,
    });
    const imageEditRequests = calls.slice(beforeImageEditSubmit);
    const imageEditQuote = imageEditRequests.find((call) => call.path === '/api/generation/quote');
    const imageEditCreate = imageEditRequests.find((call) => call.path === '/api/generations' && call.method === 'POST');
    assert.deepEqual(imageEditQuote.body.parameters, imageToImageParameters);
    assert.deepEqual(imageEditCreate.body.parameters, imageToImageParameters);

    const beforeEditAttempt = calls.length;
    await assert.rejects(
      runMotionGraphicsEdit(null, { request_id: 'generation_test_1', edit_prompt: 'edit' }),
      /server-owned Asset reference and reviewed v2v route/,
    );
    assert.equal(calls.length, beforeEditAttempt, 'unsupported edit must not quote or create a job');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});
