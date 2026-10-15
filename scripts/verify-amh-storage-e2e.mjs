import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  testStorageConnection,
  getStorageAdapter,
  ingestBuffer,
  ingestRemoteFile,
  generateStorageVariants,
  getAssetUrl,
} from '../lib/storage/storageService.js';
import { getStorageConfig } from '../lib/storage/storageConfig.js';

const RESULTS = [];

function record(name, status, details = {}) {
  RESULTS.push({ name, status, details });
  console.log(`[${status === 'PASS' ? '✓ PASS' : '✗ FAIL'}] ${name}`, details);
}

// 1x1 transparent PNG buffer
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// Minimal MP3 header frame buffer
const TINY_MP3 = Buffer.from([
  0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

// Minimal MP4 ftyp box buffer
const TINY_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
]);

async function verifyHttpUrl(url, expectedHost = 'www.Supdance.com') {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.get(url, {
      rejectUnauthorized: false,
      headers: { 'Host': expectedHost }
    }, (res) => {
      const { statusCode, headers } = res;
      res.resume();
      resolve({
        statusCode,
        contentType: headers['content-type'],
        contentLength: headers['content-length'],
        server: headers['server'],
        cacheControl: headers['cache-control'],
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('HTTP request timeout'));
    });
  });
}

async function runStorageVerificationSuite({ serverHost = '127.0.0.1', isLiveServer = false }) {
  console.log(`\n========================================`);
  console.log(`Starting AMH Object Storage Verification`);
  console.log(`Target: ${isLiveServer ? 'LIVE PRODUCTION SERVER' : 'LOCAL ENVIRONMENT'}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`========================================\n`);

  const config = await getStorageConfig();
  console.log(`Configuration:`, {
    provider: config.provider,
    storageDir: config.storageDir,
    publicUrlPrefix: config.publicUrlPrefix,
  });

  const adapter = await getStorageAdapter();
  const baseUrl = isLiveServer ? `https://${serverHost}` : `http://${serverHost}:3000`;

  // 1. Health Probe
  try {
    const health = await testStorageConnection();
    if (health.status === 'healthy' && health.provider === 'amh') {
      record('01. Storage Health Probe', 'PASS', health);
    } else {
      record('01. Storage Health Probe', 'FAIL', health);
    }
  } catch (err) {
    record('01. Storage Health Probe', 'FAIL', { error: err.message });
  }

  // 2. Scenario 1: User Avatar Upload
  let avatarResult = null;
  try {
    avatarResult = await ingestBuffer({
      body: TINY_PNG,
      type: 'avatar',
      filename: 'user_avatar_probe.png',
      contentType: 'image/png',
    });
    const exists = await adapter.exists({ key: avatarResult.objectKey });
    record('02. Scenario 1: User Avatar Storage', exists ? 'PASS' : 'FAIL', {
      objectKey: avatarResult.objectKey,
      url: avatarResult.url,
      size: avatarResult.sizeBytes,
    });
    
    if (isLiveServer) {
      const httpRes = await verifyHttpUrl(`${baseUrl}${avatarResult.url}`);
      record('02b. Scenario 1: Avatar Public Nginx Access', httpRes.statusCode === 200 ? 'PASS' : 'FAIL', httpRes);
    }
  } catch (err) {
    record('02. Scenario 1: User Avatar Storage', 'FAIL', { error: err.message });
  }

  // 3. Scenario 2: Studio Reference Image Upload & WebP Variants
  let imageResult = null;
  try {
    imageResult = await ingestBuffer({
      body: TINY_PNG,
      type: 'image',
      filename: 'studio_reference_image.png',
      contentType: 'image/png',
    });
    
    const variants = await generateStorageVariants({
      storage: adapter,
      objectKey: imageResult.objectKey,
      type: 'image',
      mimeType: 'image/png',
    });
    record('03. Scenario 2: Studio Image & Variants', 'PASS', {
      objectKey: imageResult.objectKey,
      url: imageResult.url,
      variants,
    });

    if (isLiveServer) {
      const httpRes = await verifyHttpUrl(`${baseUrl}${imageResult.url}`);
      record('03b. Scenario 2: Studio Image Public Access', httpRes.statusCode === 200 ? 'PASS' : 'FAIL', httpRes);
    }
  } catch (err) {
    record('03. Scenario 2: Studio Image & Variants', 'FAIL', { error: err.message });
  }

  // 4. Scenario 3: Studio Reference Audio Upload
  try {
    const audioResult = await ingestBuffer({
      body: TINY_MP3,
      type: 'audio',
      filename: 'studio_lipsync_ref.mp3',
      contentType: 'audio/mpeg',
    });
    record('04. Scenario 3: Studio Reference Audio', 'PASS', {
      objectKey: audioResult.objectKey,
      url: audioResult.url,
    });
    if (isLiveServer) {
      const httpRes = await verifyHttpUrl(`${baseUrl}${audioResult.url}`);
      record('04b. Scenario 3: Studio Audio Public Access', httpRes.statusCode === 200 ? 'PASS' : 'FAIL', httpRes);
    }
  } catch (err) {
    record('04. Scenario 3: Studio Reference Audio', 'FAIL', { error: err.message });
  }

  // 5. Scenario 4: Studio Reference Video Upload
  try {
    const videoResult = await ingestBuffer({
      body: TINY_MP4,
      type: 'video',
      filename: 'studio_motion_ref.mp4',
      contentType: 'video/mp4',
    });
    record('05. Scenario 4: Studio Reference Video', 'PASS', {
      objectKey: videoResult.objectKey,
      url: videoResult.url,
    });
    if (isLiveServer) {
      const httpRes = await verifyHttpUrl(`${baseUrl}${videoResult.url}`);
      record('05b. Scenario 4: Studio Video Public Access', httpRes.statusCode === 200 ? 'PASS' : 'FAIL', httpRes);
    }
  } catch (err) {
    record('05. Scenario 4: Studio Reference Video', 'FAIL', { error: err.message });
  }

  // 6. Scenarios 5, 6, 7: AI Output Persistence (Image, Video, Audio)
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/ai-gen-output.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': TINY_PNG.length });
      res.end(TINY_PNG);
    } else if (req.url === '/ai-gen-video.mp4') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': TINY_MP4.length });
      res.end(TINY_MP4);
    } else if (req.url === '/ai-gen-audio.mp3') {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': TINY_MP3.length });
      res.end(TINY_MP3);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => mockServer.listen(39999, '127.0.0.1', resolve));

  try {
    // 6a. AI Image Generation Persistence
    const aiImageResult = await ingestRemoteFile({
      url: 'http://127.0.0.1:39999/ai-gen-output.png',
      type: 'generated',
      filename: 'gen_output_probe.png',
      contentType: 'image/png',
    });
    record('06. Scenario 5: AI Image Output Persistence', 'PASS', {
      objectKey: aiImageResult.objectKey,
      url: aiImageResult.url,
      variants: aiImageResult.variants,
    });

    if (isLiveServer) {
      const httpRes = await verifyHttpUrl(`${baseUrl}${aiImageResult.url}`);
      record('06b. Scenario 5: AI Image Public Access', httpRes.statusCode === 200 ? 'PASS' : 'FAIL', httpRes);
    }

    // 6b. AI Video Generation Persistence
    const aiVideoResult = await ingestRemoteFile({
      url: 'http://127.0.0.1:39999/ai-gen-video.mp4',
      type: 'video',
      filename: 'gen_video_probe.mp4',
      contentType: 'video/mp4',
    });
    record('07. Scenario 6: AI Video Output Persistence', 'PASS', {
      objectKey: aiVideoResult.objectKey,
      url: aiVideoResult.url,
    });

    if (isLiveServer) {
      const httpRes = await verifyHttpUrl(`${baseUrl}${aiVideoResult.url}`);
      record('07b. Scenario 6: AI Video Public Access', httpRes.statusCode === 200 ? 'PASS' : 'FAIL', httpRes);
    }

    // 6c. AI Audio Generation Persistence
    const aiAudioResult = await ingestRemoteFile({
      url: 'http://127.0.0.1:39999/ai-gen-audio.mp3',
      type: 'audio',
      filename: 'gen_audio_probe.mp3',
      contentType: 'audio/mpeg',
    });
    record('08. Scenario 7: AI Audio Output Persistence', 'PASS', {
      objectKey: aiAudioResult.objectKey,
      url: aiAudioResult.url,
    });

    if (isLiveServer) {
      const httpRes = await verifyHttpUrl(`${baseUrl}${aiAudioResult.url}`);
      record('08b. Scenario 7: AI Audio Public Access', httpRes.statusCode === 200 ? 'PASS' : 'FAIL', httpRes);
    }
  } finally {
    mockServer.close();
  }

  // 7. Scenario 8: Temp & Export Files Lifecycle
  try {
    const tempBuffer = Buffer.from('TEST_EXPORT_ARCHIVE_DATA');
    const tempResult = await ingestBuffer({
      body: tempBuffer,
      type: 'other',
      filename: 'export_job_999.zip',
      contentType: 'application/octet-stream',
    });
    const existsBefore = await adapter.exists({ key: tempResult.objectKey });
    await adapter.delete({ key: tempResult.objectKey });
    const existsAfter = await adapter.exists({ key: tempResult.objectKey });

    record('09. Scenario 8: Temp / Export Lifecycle', (existsBefore && !existsAfter) ? 'PASS' : 'FAIL', {
      objectKey: tempResult.objectKey,
      created: existsBefore,
      cleanedUp: !existsAfter,
    });
  } catch (err) {
    record('09. Scenario 8: Temp / Export Lifecycle', 'FAIL', { error: err.message });
  }

  // 8. Security & Path Traversal Rejection
  try {
    let trapped = false;
    try {
      await adapter.download({ key: '../../../etc/passwd' });
    } catch (e) {
      if (['STORAGE_OBJECT_KEY_INVALID', 'STORAGE_OBJECT_PATH_OUT_OF_BOUNDS', 'STORAGE_INVALID_KEY'].includes(e.code)) {
        trapped = true;
      }
    }
    record('10. Security: Path Traversal Rejection', trapped ? 'PASS' : 'FAIL', { trapped });
  } catch (err) {
    record('10. Security: Path Traversal Rejection', 'FAIL', { error: err.message });
  }

  // 9. Historical Files Verification (Live server only)
  if (isLiveServer) {
    try {
      const hist1 = await verifyHttpUrl(`${baseUrl}/uploads/creations/202609/gen_2882d61858deab05aa1c42e1.jpg`);
      record('11. Historical File 1 Access', hist1.statusCode === 200 ? 'PASS' : 'FAIL', hist1);

      const hist2 = await verifyHttpUrl(`${baseUrl}/uploads/creations/202609/gen_a513780f7439471a593f94c7.jpg`);
      record('12. Historical File 2 Access', hist2.statusCode === 200 ? 'PASS' : 'FAIL', hist2);

      const missing = await verifyHttpUrl(`${baseUrl}/uploads/images/non-existent-probe-xyz999.jpg`);
      record('13. Non-existent Key 404', missing.statusCode === 404 ? 'PASS' : 'FAIL', { statusCode: missing.statusCode });
    } catch (err) {
      record('11-13. Historical & Missing Checks', 'FAIL', { error: err.message });
    }
  }

  console.log(`\n========================================`);
  console.log(`Verification Summary:`);
  const passes = RESULTS.filter(r => r.status === 'PASS').length;
  const fails = RESULTS.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${RESULTS.length}, Passed: ${passes}, Failed: ${fails}`);
  console.log(`========================================\n`);

  if (fails > 0) {
    process.exit(1);
  }
}

const isLive = process.argv.includes('--live');
const host = process.env.VERIFY_HOST || (isLive ? '127.0.0.1' : '127.0.0.1');

runStorageVerificationSuite({ serverHost: host, isLiveServer: isLive }).catch((err) => {
  console.error('Suite error:', err);
  process.exit(1);
});
