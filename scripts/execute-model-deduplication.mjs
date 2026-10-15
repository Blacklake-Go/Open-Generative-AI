import 'server-only';
import { execute, queryMany, queryOne, withTransaction } from '../lib/db/index.js';

export const CANONICAL_GROUPS = [
  // === 快手可灵 Kling ===
  {
    targetId: 'kling-3.0',
    name: '快手 可灵 3.0',
    category: 'video',
    display_name: '快手 可灵 3.0 Pro 旗舰全能',
    sort: 1,
    baseCredits: 45,
    preferredProvider: 'kling',
    aliases: [
      'kling-3.0-pro', 'kling-v3.0-standard-text-to-video', 'kling-v3.0-standard-image-to-video',
      'kling-v3.0-pro-recast', 'kling-v3.0-4k-image-to-video', 'kling-v3.0-4k-text-to-video',
      'kling-v3.0-omni-4k-image-to-video', 'kling-v3.0-omni-4k-text-to-video',
      'kling-v3.0-omni-pro-image-to-video', 'kling-v3.0-omni-pro-text-to-video',
      'kling-v3.0-omni-standard-image-to-video', 'kling-v3.0-omni-standard-text-to-video'
    ],
  },
  {
    targetId: 'kling-2.6',
    name: '快手 可灵 2.6',
    category: 'video',
    display_name: '快手 可灵 2.6 (电影画质/多渠道调度)',
    sort: 2,
    baseCredits: 35,
    preferredProvider: 'kling',
    aliases: ['kling-v2.6-pro-t2v', 'kling-v2.6-pro-i2v', 'kling-v2.6-std-motion-control', 'kling-v2.6-pro-motion-control'],
  },
  {
    targetId: 'kling-2.5',
    name: '快手 可灵 2.5',
    category: 'video',
    display_name: '快手 可灵 2.5 Turbo',
    sort: 3,
    baseCredits: 28,
    preferredProvider: 'kling',
    aliases: ['kling-v2.5-turbo-pro-t2v', 'kling-v2.5-turbo-pro-i2v'],
  },
  {
    targetId: 'kling-2.1',
    name: '快手 可灵 2.1',
    category: 'video',
    display_name: '快手 可灵 2.1 Master',
    sort: 4,
    baseCredits: 25,
    preferredProvider: 'kling',
    aliases: ['kling-v2.1-master-t2v', 'kling-v2.1-master-i2v', 'kling-v2.1-standard-i2v'],
  },
  {
    targetId: 'kling-o1',
    name: '快手 可灵 O1',
    category: 'video',
    display_name: '快手 可灵 O1 全模态视觉模型',
    sort: 5,
    baseCredits: 40,
    preferredProvider: 'kling',
    aliases: [
      'kling-o1-text-to-video', 'kling-o1-image-to-video', 'kling-o1-reference-to-video',
      'kling-o1-standard-image-to-video', 'kling-o1-standard-reference-to-video',
      'kling-o1-video-edit', 'kling-o1-video-edit-fast', 'kling-o1-standard-video-edit',
      'kling-o1-text-to-image', 'kling-o1-edit-image', 'kling-o3-image'
    ],
  },

  // === 字节跳动 / 即梦 / 豆包 (保留 Seedream 5.0、Seedream 4.5、Seedance 2.0) ===
  {
    targetId: 'seedream-5.0',
    name: 'Seedream 5.0',
    category: 'image',
    display_name: '字节跳动 Seedream 5.0 (商业摄影质感)',
    sort: 1,
    baseCredits: 15,
    preferredProvider: 'byteplus',
    aliases: [
      'seedream-5.0-edit',
      'bytedance-seedream-5.0-pro',
      'bytedance-seedream-5.0-pro-edit',
      'bytedance-seedream-v5.0',
      'bytedance-seedream-v5.0-edit'
    ],
  },
  {
    targetId: 'seedream-4.5',
    name: 'Seedream 4.5',
    category: 'image',
    display_name: '字节跳动 Seedream 4.5',
    sort: 2,
    baseCredits: 12,
    preferredProvider: 'byteplus',
    aliases: [
      'seedream-4.0',
      'seedream-3.0',
      'bytedance-seedream-v4.5',
      'bytedance-seedream-v4.5-edit',
      'bytedance-seedream-v4',
      'bytedance-seedream-v4-edit',
      'bytedance-seedream-edit-v4',
      'bytedance-seedream-v3'
    ],
  },
  {
    targetId: 'seedance-2.0',
    name: 'Seedance 2.0',
    category: 'video',
    display_name: '字节跳动 Seedance 2.0 动态视频',
    sort: 3,
    baseCredits: 28,
    preferredProvider: 'byteplus',
    aliases: [
      'seedance-2.5',
      'seedance-1.5',
      'seedance-v2.0-t2v',
      'seedance-v2.0-i2v',
      'bytedance-seedance-2.0',
      'seedance-2.5-image-to-video',
      'seedance-1.5-pro'
    ],
  },
  {
    targetId: 'doubao-1.5-pro',
    name: '豆包 1.5 Pro',
    category: 'text',
    display_name: '字节跳动 豆包 1.5 Pro',
    sort: 1,
    baseCredits: 5,
    preferredProvider: 'byteplus',
    aliases: ['bytedance-doubao-1.5-pro'],
  },
  {
    targetId: 'doubao-1.5-pro',
    name: '豆包 1.5 Pro',
    category: 'text',
    display_name: '字节跳动 豆包 1.5 Pro',
    sort: 1,
    baseCredits: 5,
    preferredProvider: 'byteplus',
    aliases: ['bytedance-doubao-1.5-pro'],
  },

  // === MiniMax / 海螺 ===
  {
    targetId: 'hailuo-02',
    name: 'MiniMax 海螺 02',
    category: 'video',
    display_name: 'MiniMax 海螺 02 (原生高拟真动态)',
    sort: 9,
    baseCredits: 28,
    preferredProvider: 'minimax',
    aliases: ['minimax-hailuo-02', 'minimax-video-01-live', 'minimax-video-01'],
  },
  {
    targetId: 'hailuo-2.3',
    name: 'MiniMax 海螺 2.3',
    category: 'video',
    display_name: 'MiniMax 海螺 2.3 电影级视频生成',
    sort: 10,
    baseCredits: 30,
    preferredProvider: 'minimax',
    aliases: ['minimax-hailuo-2.3-standard-t2v', 'minimax-hailuo-2.3-standard-i2v', 'minimax-hailuo-2.3'],
  },
  {
    targetId: 'minimax-speech-2.6',
    name: 'MiniMax 语音 2.6',
    category: 'audio',
    display_name: 'MiniMax 语音合成 2.6 (高清拟真/情感表现)',
    sort: 1,
    baseCredits: 12,
    preferredProvider: 'minimax',
    aliases: ['minimax-speech-2.6-hd', 'minimax-speech-2.6-turbo'],
  },
  {
    targetId: 'minimax-voice-clone',
    name: 'MiniMax 声音克隆',
    category: 'audio',
    display_name: 'MiniMax 零样本声音复刻',
    sort: 2,
    baseCredits: 25,
    preferredProvider: 'minimax',
    aliases: [],
  },
  {
    targetId: 'minimax-music-3.0',
    name: 'MiniMax 音乐 3.0',
    category: 'audio',
    display_name: 'MiniMax 音乐创作 3.0',
    sort: 3,
    baseCredits: 25,
    preferredProvider: 'minimax',
    aliases: [],
  },

  // === 阿里百炼 / DashScope (Wan 万相 & 通义千问) ===
  {
    targetId: 'wan-2.1',
    name: '阿里 万相 2.1',
    category: 'video',
    display_name: '阿里 万相 2.1 (通义万相多模态矩阵)',
    sort: 11,
    baseCredits: 26,
    preferredProvider: 'alibaba',
    aliases: ['wan2.1-text-to-image', 'wan2.1-image-to-video', 'wan2.1-t2v-14b', 'wan2.1-i2v-14b', 'wanx2.1-t2v-plus'],
  },
  {
    targetId: 'wan-2.2',
    name: '阿里 万相 2.2',
    category: 'video',
    display_name: '阿里 万相 2.2 视频编辑与特效',
    sort: 12,
    baseCredits: 30,
    preferredProvider: 'alibaba',
    aliases: ['wan2.2-image-to-video', 'wan2.2-edit-video'],
  },
  {
    targetId: 'qwen-vl-max',
    name: '通义千问 Qwen-VL-Max',
    category: 'text',
    display_name: '阿里 通义千问 Qwen-VL-Max 多模态视觉',
    sort: 2,
    baseCredits: 8,
    preferredProvider: 'alibaba',
    aliases: ['qwen-vl-plus', 'qwen-turbo'],
  },

  // === Google / Veo / Imagen ===
  {
    targetId: 'veo-2',
    name: 'Google Veo 2',
    category: 'video',
    display_name: 'Google Veo 2 电影级高清视频',
    sort: 13,
    baseCredits: 38,
    preferredProvider: 'google',
    aliases: ['veo-2-text-to-video', 'veo-2-image-to-video'],
  },
  {
    targetId: 'veo-3',
    name: 'Google Veo 3',
    category: 'video',
    display_name: 'Google Veo 3 下一代极速渲染',
    sort: 14,
    baseCredits: 48,
    preferredProvider: 'google',
    aliases: ['veo3-fast-image-to-video', 'veo3-fast-text-to-video', 'veo-3-fast'],
  },
  {
    targetId: 'imagen-4',
    name: 'Google Imagen 4',
    category: 'image',
    display_name: 'Google Imagen 4 超清生图',
    sort: 6,
    baseCredits: 16,
    preferredProvider: 'google',
    aliases: ['google-imagen-4'],
  },
  {
    targetId: 'gemini-omni-flash',
    name: 'Gemini Omni Flash',
    category: 'video',
    display_name: 'Google Gemini Omni Flash 1.1 实时交互视频',
    sort: 15,
    baseCredits: 35,
    preferredProvider: 'google',
    aliases: [
      'gemini-omni-flash-1-1-text-to-video', 'gemini-omni-flash-1-1-image-to-video',
      'gemini-omni-image-to-video', 'gemini-omni-text-to-video'
    ],
  },

  // === OpenAI ===
  {
    targetId: 'gpt-image',
    name: 'GPT Image',
    category: 'image',
    display_name: 'OpenAI GPT Image (DALL·E 3 / GPT-4o)',
    sort: 7,
    baseCredits: 18,
    preferredProvider: 'openai',
    aliases: ['gpt4o-text-to-image', 'gpt4o-image-to-image', 'gpt4o-edit', 'gpt-image-2.5', 'gpt-image-2.5-flash', 'gpt-image-2'],
  },
  {
    targetId: 'sora-turbo',
    name: 'OpenAI Sora Turbo',
    category: 'video',
    display_name: 'OpenAI Sora Turbo 物理世界模拟',
    sort: 16,
    baseCredits: 50,
    preferredProvider: 'openai',
    aliases: ['openai-sora-turbo', 'sora-video', 'openai-sora'],
  },
  {
    targetId: 'gpt-4o',
    name: 'OpenAI GPT-4o',
    category: 'text',
    display_name: 'OpenAI GPT-4o 旗舰多模态',
    sort: 3,
    baseCredits: 10,
    preferredProvider: 'openai',
    aliases: ['chatgpt-4o-latest'],
  },

  // === FLUX (合并为 FLUX.1 Pro、FLUX.1 Dev、FLUX.1 Schnell、FLUX.2) ===
  {
    targetId: 'flux-1-pro',
    name: 'FLUX.1 Pro',
    category: 'image',
    display_name: 'FLUX.1 Pro 顶级专业画质',
    sort: 8,
    baseCredits: 20,
    preferredProvider: 'muapi',
    aliases: [
      'flux-pro',
      'flux-1.1-pro',
      'flux-1.1-pro-ultra',
      'flux-kontext-pro-t2i',
      'flux-kontext-pro-i2i'
    ],
  },
  {
    targetId: 'flux-1-dev',
    name: 'FLUX.1 Dev',
    category: 'image',
    display_name: 'FLUX.1 Dev 开源旗舰质感',
    sort: 9,
    baseCredits: 14,
    preferredProvider: 'muapi',
    aliases: ['flux-dev', 'flux-kontext-dev-t2i', 'flux-kontext-dev-i2i'],
  },
  {
    targetId: 'flux-1-schnell',
    name: 'FLUX.1 Schnell',
    category: 'image',
    display_name: 'FLUX.1 Schnell 极速出图',
    sort: 10,
    baseCredits: 10,
    preferredProvider: 'muapi',
    aliases: ['flux-schnell', 'flux-schnell-image'],
  },
  {
    targetId: 'flux-2',
    name: 'FLUX.2',
    category: 'image',
    display_name: 'FLUX.2 下一代多模态',
    sort: 11,
    baseCredits: 18,
    preferredProvider: 'muapi',
    aliases: [
      'flux-2-dev',
      'flux-2-flex',
      'flux-2-klein-4b',
      'flux-2-klein-9b',
      'flux-2-klein-4b-turbo',
      'flux-2-klein-9b-turbo'
    ],
  },
  {
    targetId: 'flux-3',
    name: 'FLUX.3 Video',
    category: 'video',
    display_name: 'FLUX 3.0 下一代视频渲染',
    sort: 17,
    baseCredits: 35,
    preferredProvider: 'muapi',
    aliases: ['flux-3-text-to-video', 'flux-3-image-to-video'],
  },

  // === Luma ===
  {
    targetId: 'luma-dream-machine',
    name: 'Luma Dream Machine',
    category: 'video',
    display_name: 'Luma Dream Machine (Ray 2 摄影流)',
    sort: 18,
    baseCredits: 32,
    preferredProvider: 'luma',
    aliases: ['luma-ray-2'],
  },

  // === Runway ===
  {
    targetId: 'runway-image-to-video',
    name: 'Runway Gen-3',
    category: 'video',
    display_name: 'Runway Gen-3 Alpha 电影级视频生成',
    sort: 19,
    baseCredits: 35,
    preferredProvider: 'runway',
    aliases: ['runway-aleph-v2v', 'runway-act-two-recast', 'runway-gen-3'],
  },

  // === 生数科技 Vidu ===
  {
    targetId: 'vidu-2.0',
    name: 'Vidu 2.0',
    category: 'video',
    display_name: 'Vidu 2.0 生数科技',
    sort: 20,
    baseCredits: 28,
    preferredProvider: 'muapi',
    aliases: ['vidu-2.0-t2v', 'vidu-2.0-i2v'],
  },

  // === Midjourney ===
  {
    targetId: 'midjourney-v7',
    name: 'Midjourney v7',
    category: 'image',
    display_name: 'Midjourney v7 极致艺术美学',
    sort: 13,
    baseCredits: 22,
    preferredProvider: 'muapi',
    aliases: ['midjourney-v7.0'],
  },
  {
    targetId: 'midjourney-v6.1',
    name: 'Midjourney v6.1',
    category: 'image',
    display_name: 'Midjourney v6.1 真实光影质感',
    sort: 14,
    baseCredits: 18,
    preferredProvider: 'muapi',
    aliases: [],
  },

  // === Suno (合并文生曲/延长/加人声等为 Suno v4、Suno v3.5) ===
  {
    targetId: 'suno-v4',
    name: 'Suno v4',
    category: 'audio',
    display_name: 'Suno v4 录音棚母带级全曲',
    sort: 4,
    baseCredits: 35,
    preferredProvider: 'muapi',
    aliases: [
      'suno-v4-generate',
      'suno-v4-extend',
      'suno-create-music',
      'suno-remix-music',
      'suno-extend-music',
      'suno-add-vocals',
      'suno-add-instrumental',
      'suno-generate-mashup'
    ],
  },
  {
    targetId: 'suno-v3.5',
    name: 'Suno v3.5',
    category: 'audio',
    display_name: 'Suno v3.5 流行音乐合成',
    sort: 5,
    baseCredits: 25,
    preferredProvider: 'muapi',
    aliases: [
      'suno-v3-5-generate',
      'suno-v3-5-extend',
      'suno-v3-5',
      'suno-chirp-v3.5',
      'suno-convert-to-wav',
      'suno-generate-sounds'
    ],
  },

  // === Udio ===
  {
    targetId: 'udio-v1.5',
    name: 'Udio v1.5',
    category: 'audio',
    display_name: 'Udio v1.5 高保真音频',
    sort: 6,
    baseCredits: 25,
    preferredProvider: 'muapi',
    aliases: [],
  },

  // === DeepSeek ===
  {
    targetId: 'deepseek-v3',
    name: 'DeepSeek V3',
    category: 'text',
    display_name: 'DeepSeek V3 顶级推理',
    sort: 4,
    baseCredits: 5,
    preferredProvider: 'muapi',
    aliases: [],
  },
  {
    targetId: 'deepseek-r1',
    name: 'DeepSeek R1',
    category: 'text',
    display_name: 'DeepSeek R1 深度思考',
    sort: 5,
    baseCredits: 8,
    preferredProvider: 'muapi',
    aliases: [],
  },

  // === 腾讯混元 ===
  {
    targetId: 'hunyuan-video',
    name: '腾讯 混元 Video',
    category: 'video',
    display_name: '腾讯 混元开源视频大模型 (HunyuanVideo)',
    sort: 21,
    baseCredits: 25,
    preferredProvider: 'muapi',
    aliases: ['hunyuan-image-to-video', 'hunyuan-text-to-video'],
  },

  // === 智谱 AI ===
  {
    targetId: 'cogvideo-2b',
    name: '智谱 CogVideoX',
    category: 'video',
    display_name: '智谱 CogVideoX 视频生成',
    sort: 22,
    baseCredits: 25,
    preferredProvider: 'muapi',
    aliases: [],
  },

  // === Stability AI ===
  {
    targetId: 'sd-3.5-large',
    name: 'Stable Diffusion 3.5 Large',
    category: 'image',
    display_name: 'Stability SD 3.5 Large 工业级',
    sort: 15,
    baseCredits: 14,
    preferredProvider: 'muapi',
    aliases: ['stability-sd-3.5'],
  },

  // === Topaz ===
  {
    targetId: 'topaz-video-ai',
    name: 'Topaz Video AI',
    category: 'video',
    display_name: 'Topaz Video AI 4K/60fps 极限画质超分',
    sort: 23,
    baseCredits: 30,
    preferredProvider: 'muapi',
    aliases: [],
  },

  // === 口型数字人 ===
  {
    targetId: 'infinitetalk',
    name: 'InfiniteTalk 口型数字人',
    category: 'video',
    display_name: 'InfiniteTalk 极速口型驱动数字人',
    sort: 24,
    baseCredits: 20,
    preferredProvider: 'muapi',
    aliases: ['infinitetalk-image-to-video', 'infinitetalk-video-to-video'],
  },
];

export async function executeDeduplication() {
  console.log('====================================================');
  console.log('🚀 [SupDance] 开始执行全库模型去重与分层收敛治理');
  console.log('====================================================');

  const stats = {
    canonicalActivated: 0,
    channelsMigrated: 0,
    channelsDeduped: 0,
    aliasesDisabled: 0,
    rhModelsDemoted: 0,
    secondaryModelsHidden: 0,
  };

  await withTransaction(async (tx) => {
    // -------------------------------------------------------------
    // 步骤 1：处理预设核心旗舰家族，安全改绑与归并渠道
    // -------------------------------------------------------------
    const targetIdSet = new Set(CANONICAL_GROUPS.map((g) => g.targetId));

    for (const group of CANONICAL_GROUPS) {
      const { targetId, name, category, display_name, sort, baseCredits, aliases, preferredProvider } = group;

      // 1. 确保目标规范模型存在，并置为 core + visible + active
      const existing = await tx.queryOne('SELECT id FROM ai_studio.ai_models WHERE id = $1', [targetId]);
      if (!existing) {
        await tx.execute(`
          INSERT INTO ai_studio.ai_models (
            id, slug, name, display_name, category, description, status,
            tier, is_visible, sort, is_featured, created_at, updated_at
          ) VALUES (
            $1, $1, $2, $3, $4, $5, 'active',
            'core', true, $6, true, now(), now()
          )
        `, [targetId, name, display_name, category, `${display_name} - 官方权威规范模型`, sort || 10]);
      } else {
        await tx.execute(`
          UPDATE ai_studio.ai_models
          SET name = $2, display_name = $3, category = $4, status = 'active',
              tier = 'core', is_visible = true, sort = $5, updated_at = now()
          WHERE id = $1
        `, [targetId, name, display_name, category, sort || 10]);
      }
      stats.canonicalActivated++;

      // 2. 将所有别名模型的渠道迁移到 targetId 下
      for (const aliasId of aliases) {
        const aliasChannels = await tx.queryMany(
          'SELECT * FROM ai_studio.provider_models WHERE model_id = $1',
          [aliasId]
        );

        for (const ch of aliasChannels) {
          // 检查 targetId 下是否已存在相同 provider_id + provider_model_id
          const conflict = await tx.queryOne(
            'SELECT id FROM ai_studio.provider_models WHERE model_id = $1 AND provider_id = $2 AND provider_model_id = $3',
            [targetId, ch.provider_id, ch.provider_model_id]
          );

          if (!conflict) {
            await tx.execute(
              'UPDATE ai_studio.provider_models SET model_id = $1, updated_at = now() WHERE id = $2',
              [targetId, ch.id]
            );
            stats.channelsMigrated++;
          } else {
            // 已存在相同通道映射，删除别名下的冗余通道
            await tx.execute('DELETE FROM ai_studio.provider_models WHERE id = $1', [ch.id]);
            stats.channelsDeduped++;
          }
        }

        // 将被合并的别名模型置为 disabled + hidden
        await tx.execute(`
          UPDATE ai_studio.ai_models
          SET status = 'disabled', is_visible = false, tier = 'backup',
              description = $2, updated_at = now()
          WHERE id = $1
        `, [aliasId, `已合并至规范模型 [${targetId}]`]);
        stats.aliasesDisabled++;
      }

      // 3. 规范模型的渠道主选 (Primary) 标记
      const targetChannels = await tx.queryMany(
        'SELECT id, provider_id, priority FROM ai_studio.provider_models WHERE model_id = $1 ORDER BY priority DESC',
        [targetId]
      );

      if (targetChannels.length > 0) {
        let primaryCh = targetChannels.find((c) => c.provider_id === preferredProvider);
        if (!primaryCh) {
          primaryCh = targetChannels.find((c) => ['byteplus', 'volcengine', 'kling', 'alibaba', 'minimax', 'google', 'openai', 'runway', 'luma'].includes(c.provider_id));
        }
        if (!primaryCh) {
          primaryCh = targetChannels[0];
        }

        // 清空其他
        await tx.execute(`
          UPDATE ai_studio.provider_models
          SET metadata = COALESCE(metadata, '{}'::jsonb) - 'primary', updated_at = now()
          WHERE model_id = $1 AND id <> $2
        `, [targetId, primaryCh.id]);

        // 设置 primary
        await tx.execute(`
          UPDATE ai_studio.provider_models
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
              enabled = true, updated_at = now()
          WHERE id = $1
        `, [primaryCh.id]);
      }

      // 4. 补充标准定价策略
      await tx.execute(`
        INSERT INTO ai_studio.model_pricing
          (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
        VALUES
          ($1, $2, 'fixed', $3, '{}'::jsonb, '{}'::jsonb, 5, 0.7500, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          base_credits = EXCLUDED.base_credits,
          is_active = true,
          updated_at = now()
      `, [`prc_${targetId.replace(/[-.]/g, '_')}`, targetId, baseCredits || 20]);

      // 5. 补充路由策略
      await tx.execute(`
        INSERT INTO ai_studio.routing_policies
          (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
        VALUES
          ($1, $2, 'cost', '{"cost":0.5,"success_rate":0.3,"speed":0.2,"capacity":0.0}'::jsonb,
           '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          failover_enabled = true,
          updated_at = now()
      `, [`rp_${targetId.replace(/[-.]/g, '_')}`, targetId]);
    }

    // -------------------------------------------------------------
    // 步骤 1.5：针对 Kling, FLUX, Seedream, Seedance, Suno 家族碎片的全量智能归并改绑
    // -------------------------------------------------------------
    const residualFragments = await tx.queryMany(
      "SELECT id, name FROM ai_studio.ai_models WHERE status != 'disabled'"
    );

    for (const m of residualFragments) {
      if (targetIdSet.has(m.id)) continue;
      const lower = m.id.toLowerCase();
      let assignedTarget = null;

      // 1. 快手可灵 (Kling)
      if (lower.includes('kling')) {
        if (lower.includes('3.0') || lower.includes('v3') || lower.includes('3-0')) assignedTarget = 'kling-3.0';
        else if (lower.includes('2.6') || lower.includes('v2.6') || lower.includes('2-6')) assignedTarget = 'kling-2.6';
        else if (lower.includes('2.5') || lower.includes('v2.5') || lower.includes('2-5')) assignedTarget = 'kling-2.5';
        else if (lower.includes('2.1') || lower.includes('v2.1') || lower.includes('2-1') || lower.includes('master')) assignedTarget = 'kling-2.1';
        else if (lower.includes('o1') || lower.includes('01')) assignedTarget = 'kling-o1';
        else assignedTarget = 'kling-3.0';
      }
      // 2. FLUX
      else if (lower.includes('flux')) {
        if (lower.includes('schnell')) assignedTarget = 'flux-1-schnell';
        else if (lower.includes('pro') || lower.includes('ultra')) assignedTarget = 'flux-1-pro';
        else if (lower.includes('flux-2') || lower.includes('flux2') || lower.includes('klein')) assignedTarget = 'flux-2';
        else assignedTarget = 'flux-1-dev';
      }
      // 3. 即梦 / 豆包 (Seedream & Seedance)
      else if (lower.includes('seedream')) {
        if (lower.includes('5.0') || lower.includes('v5') || lower.includes('edit')) assignedTarget = 'seedream-5.0';
        else assignedTarget = 'seedream-4.5';
      }
      else if (lower.includes('seedance')) {
        assignedTarget = 'seedance-2.0';
      }
      // 4. Suno
      else if (lower.includes('suno')) {
        if (lower.includes('v4') || lower.includes('4')) assignedTarget = 'suno-v4';
        else assignedTarget = 'suno-v3.5';
      }

      if (assignedTarget) {
        // 迁移该碎片模型的所有渠道至 assignedTarget
        const channels = await tx.queryMany(
          'SELECT * FROM ai_studio.provider_models WHERE model_id = $1',
          [m.id]
        );
        for (const ch of channels) {
          const conflict = await tx.queryOne(
            'SELECT id FROM ai_studio.provider_models WHERE model_id = $1 AND provider_id = $2 AND provider_model_id = $3',
            [assignedTarget, ch.provider_id, ch.provider_model_id]
          );
          if (!conflict) {
            await tx.execute(
              'UPDATE ai_studio.provider_models SET model_id = $1, updated_at = now() WHERE id = $2',
              [assignedTarget, ch.id]
            );
            stats.channelsMigrated++;
          } else {
            await tx.execute('DELETE FROM ai_studio.provider_models WHERE id = $1', [ch.id]);
            stats.channelsDeduped++;
          }
        }

        await tx.execute(
          "UPDATE ai_studio.ai_models SET status = 'disabled', tier = 'deprecated', is_visible = false, description = $2, updated_at = now() WHERE id = $1",
          [m.id, `已归并至平台规范模型 [${assignedTarget}]`]
        );
        stats.aliasesDisabled++;
      }
    }

    // -------------------------------------------------------------
    // 步骤 2：沉降 382 个 RunningHub 原生 `rh-*` 模型为不可见备份
    // -------------------------------------------------------------
    const rhResult = await tx.execute(`
      UPDATE ai_studio.ai_models
      SET tier = 'backup', is_visible = false, status = 'disabled', updated_at = now()
      WHERE id LIKE 'rh-%' AND tier != 'core'
    `);
    stats.rhModelsDemoted = rhResult.rowCount || 0;

    // -------------------------------------------------------------
    // 步骤 3：将其余非 Core 核心规范的模型统一设置为 backup + is_visible = false + disabled
    // -------------------------------------------------------------
    const secondaryResult = await tx.execute(`
      UPDATE ai_studio.ai_models
      SET tier = 'backup', is_visible = false, status = 'disabled', updated_at = now()
      WHERE id NOT IN (${Array.from(targetIdSet).map((_, i) => `$${i + 1}`).join(', ')})
    `, Array.from(targetIdSet));
    stats.secondaryModelsHidden = secondaryResult.rowCount || 0;
  });

  console.log('====================================================');
  console.log('✅ 去重与收敛执行完毕！统计数据：');
  console.log(`- 激活核心旗舰规范模型: ${stats.canonicalActivated} 个`);
  console.log(`- 迁移归并渠道通道数: ${stats.channelsMigrated} 个`);
  console.log(`- 清理重复同名渠道数: ${stats.channelsDeduped} 个`);
  console.log(`- 归档禁用别名碎片模型: ${stats.aliasesDisabled} 个`);
  console.log(`- 沉降 RunningHub 裸工作流: ${stats.rhModelsDemoted} 个`);
  console.log(`- 收敛其余非核心模型为备份: ${stats.secondaryModelsHidden} 个`);
  console.log('====================================================');
  return stats;
}

// 命令行直接执行
if (process.argv[1] && process.argv[1].endsWith('execute-model-deduplication.mjs')) {
  executeDeduplication()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error during deduplication execution:', err);
      process.exit(1);
    });
}
