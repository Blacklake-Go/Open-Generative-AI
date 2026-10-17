import { register } from 'node:module';
try {
  register('./server-only-loader.mjs', import.meta.url);
} catch {}

const { listCanvasModelCandidates, saveCanvasModelConfig, getCanvasModelConfig } = await import('../lib/services/canvasModelConfig.js');

const candidates = await listCanvasModelCandidates();
console.log('Total candidates:', candidates.length);

const imageMounts = ['seedream-4.5', 'seedream-5.0-pro', 'seedream-5.0-lite'];

const priorityVideoSet = new Set([
  'wan-2.1', 'wan2.1-t2v-14b', 'wan2.1-i2v-14b', 'wan-2.2',
  'hailuo-02', 'hailuo-2.3', 'minimax-video-01', 'minimax-hailuo-2.3-standard-t2v', 'minimax-hailuo-2.3-standard-i2v',
  'seedance-v2.0-t2v', 'seedance-v2.0-i2v', 'seedance-2-t2v', 'seedance-pro-t2v', 'seedance-2.5-motion-control',
  'kling-3.0-pro', 'kling-v2.6-pro-text-to-video', 'kling-v2.6-std-text-to-video', 'kling-v3.0-standard-text-to-video',
  'veo-2-text-to-video', 'veo-2-image-to-video',
]);

const videoCandidates = candidates.filter(c => c.capability === 'video').map(c => c.id);
const mountedVideos = [
  ...videoCandidates.filter(id => priorityVideoSet.has(id)),
  ...videoCandidates.filter(id => !priorityVideoSet.has(id)),
].slice(0, 30);

const audioCandidates = candidates.filter(c => c.capability === 'audio').map(c => c.id);
const mountedAudios = audioCandidates.slice(0, 15);

const videoDefault = mountedVideos.includes('wan-2.1') ? 'wan-2.1' : (mountedVideos[0] || '');
const audioDefault = mountedAudios.includes('minimax-music-3.0') ? 'minimax-music-3.0' : (mountedAudios[0] || '');

const input = {
  mountedModelIds: {
    image: imageMounts,
    video: mountedVideos,
    audio: mountedAudios,
    text: [],
  },
  defaults: {
    imageModelId: 'seedream-4.5',
    videoModelId: videoDefault,
    audioModelId: audioDefault,
    textModelId: '',
    canvasImageCount: '1',
    audioVoice: 'alloy',
    audioFormat: 'mp3',
    audioSpeed: '1',
    audioInstructions: '',
    systemPrompt: '',
  },
};

const actor = { id: 'admin', email: 'support@supdance.com', role: 'super_admin' };
const res = await saveCanvasModelConfig({
  actor,
  input,
  requestId: 'mount_canvas_' + Date.now(),
});

if (res.error) {
  console.error('saveCanvasModelConfig failed:', res.error);
  process.exit(1);
}

console.log('Saved canvas model config successfully!');
const verified = await getCanvasModelConfig();
console.log('Mounted Image Models:', verified.mountedModelIds.image);
console.log('Default Image Model:', verified.defaults.imageModelId);
console.log('Mounted Video Models Count:', verified.mountedModelIds.video.length);
console.log('Mounted Audio Models Count:', verified.mountedModelIds.audio.length);

process.exit(0);
