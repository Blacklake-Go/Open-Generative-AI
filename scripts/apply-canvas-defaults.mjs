import fs from 'node:fs';
import dotenv from 'dotenv';

if (fs.existsSync('/etc/supdance.env')) {
  dotenv.config({ path: '/etc/supdance.env' });
} else if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

const { listCanvasModelCandidates, getCanvasModelConfig, getCanvasAllowedModelIds, saveCanvasModelConfig } = await import('../lib/services/canvasModelConfig.js');

async function main() {
  console.log('--- 开始应用无限画布默认模型与挂载配置 ---');
  const candidates = await listCanvasModelCandidates();
  console.log(`检索到可用候选模型总计: ${candidates.length} 个`);

  const byCap = { image: [], video: [], audio: [], text: [] };
  for (const c of candidates) {
    if (byCap[c.capability]) {
      byCap[c.capability].push(c.id);
    }
  }

  console.log(`- 图片模型候选: ${byCap.image.length} 个`);
  console.log(`- 视频模型候选: ${byCap.video.length} 个`);
  console.log(`- 音频/音乐候选: ${byCap.audio.length} 个`);
  console.log(`- 文本模型候选: ${byCap.text.length} 个`);

  // 默认模型指定
  const imageDefault = byCap.image.includes('seedream-4.5') ? 'seedream-4.5' : (byCap.image[0] || '');

  // 筛选核心视频模型（确保覆盖阿里万相、MiniMax海螺、字节Seedance、快手可灵、谷歌Veo）并严格控制在 10,000 字符限制内
  const priorityVideoSet = new Set([
    'wan-2.1', 'wan2.1-t2v-14b', 'wan2.1-i2v-14b', 'wan-2.2',
    'hailuo-02', 'hailuo-2.3', 'minimax-video-01', 'minimax-hailuo-2.3-standard-t2v', 'minimax-hailuo-2.3-standard-i2v',
    'seedance-v2.0-t2v', 'seedance-v2.0-i2v', 'seedance-2-t2v', 'seedance-pro-t2v', 'seedance-2.5-motion-control',
    'kling-3.0-pro', 'kling-v2.6-pro-text-to-video', 'kling-v2.6-std-text-to-video', 'kling-v3.0-standard-text-to-video',
    'veo-2-text-to-video', 'veo-2-image-to-video',
  ]);
  const mountedVideos = [
    ...byCap.video.filter((id) => priorityVideoSet.has(id)),
    ...byCap.video.filter((id) => !priorityVideoSet.has(id)),
  ].slice(0, 50);

  const videoDefault = mountedVideos.includes('wan-2.1')
    ? 'wan-2.1'
    : (mountedVideos.includes('hailuo-02') ? 'hailuo-02' : (mountedVideos[0] || ''));

  const audioDefault = byCap.audio.includes('minimax-music-3.0')
    ? 'minimax-music-3.0'
    : (byCap.audio.includes('minimax-speech-2.6-hd') ? 'minimax-speech-2.6-hd' : (byCap.audio[0] || ''));

  console.log(`设置默认模型:`);
  console.log(`  图片: ${imageDefault} (已挂载 ${byCap.image.length} 个)`);
  console.log(`  视频: ${videoDefault} (已挂载 ${mountedVideos.length} 个)`);
  console.log(`  音频: ${audioDefault} (已挂载 ${byCap.audio.length} 个)`);

  const input = {
    mountedModelIds: {
      image: byCap.image,
      video: mountedVideos,
      audio: byCap.audio,
      text: [],
    },
    defaults: {
      imageModelId: imageDefault,
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

  const actor = { id: '808405', email: 'support@supdance.com', role: 'super_admin' };
  const res = await saveCanvasModelConfig({
    actor,
    input,
    requestId: 'apply_canvas_' + Date.now(),
  });

  if (res.error) {
    console.error('保存失败:', res.error);
    process.exit(1);
  }

  console.log('配置保存成功并已写入系统设置 system_settings!');
  const verifiedConfig = await getCanvasModelConfig();
  console.log('读取持久化配置:');
  console.log('  已挂载图片模型:', verifiedConfig.mountedModelIds.image.length);
  console.log('  已挂载视频模型:', verifiedConfig.mountedModelIds.video.length);
  console.log('  已挂载音频模型:', verifiedConfig.mountedModelIds.audio.length);
  console.log('  默认图片模型:', verifiedConfig.defaults.imageModelId);
  console.log('  默认视频模型:', verifiedConfig.defaults.videoModelId);
  console.log('  默认音频模型:', verifiedConfig.defaults.audioModelId);

  const allowed = await getCanvasAllowedModelIds({ userId: '808405' });
  console.log(`画布客户端准入模型数: ${allowed.size} 个`);
  console.log('  包含 seedream-4.5:', allowed.has('seedream-4.5'));
  console.log('  包含 videoDefault:', allowed.has(videoDefault));
  console.log('  包含 audioDefault:', allowed.has(audioDefault));

  console.log('--- 全部应用完成 ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('执行异常:', err);
  process.exit(1);
});
