import 'server-only';
import { execute, queryMany, queryOne, withTransaction } from '../lib/db/index.js';

/**
 * 核心模型规范家族映射表 (Canonical Family Mappings)
 * 将零散的任务后缀 (t2v/i2v/edit) 与跨渠道同名模型聚合归一到唯一的权威模型下
 */
const CANONICAL_GROUPS = [
  // === 快手可灵 Kling ===
  {
    targetId: 'kling-2.6',
    name: '快手 可灵 2.6',
    category: 'video',
    display_name: '快手 可灵 2.6 (电影画质/多渠道调度)',
    aliases: ['kling-v2.6-pro-t2v', 'kling-v2.6-pro-i2v', 'kling-v2.6-std-motion-control', 'kling-v2.6-pro-motion-control'],
    preferredProvider: 'kling',
    baseCredits: 35,
  },
  {
    targetId: 'kling-2.5',
    name: '快手 可灵 2.5',
    category: 'video',
    display_name: '快手 可灵 2.5 Turbo',
    aliases: ['kling-v2.5-turbo-pro-t2v', 'kling-v2.5-turbo-pro-i2v'],
    preferredProvider: 'kling',
    baseCredits: 28,
  },
  {
    targetId: 'kling-2.1',
    name: '快手 可灵 2.1',
    category: 'video',
    display_name: '快手 可灵 2.1 Master',
    aliases: ['kling-v2.1-master-t2v', 'kling-v2.1-master-i2v', 'kling-v2.1-standard-i2v'],
    preferredProvider: 'kling',
    baseCredits: 25,
  },
  {
    targetId: 'kling-3.0',
    name: '快手 可灵 3.0',
    category: 'video',
    display_name: '快手 可灵 3.0 Pro 旗舰全能',
    aliases: [
      'kling-3.0-pro', 'kling-v3.0-standard-text-to-video', 'kling-v3.0-standard-image-to-video',
      'kling-v3.0-pro-recast', 'kling-v3.0-4k-image-to-video', 'kling-v3.0-4k-text-to-video',
      'kling-v3.0-omni-4k-image-to-video', 'kling-v3.0-omni-4k-text-to-video',
      'kling-v3.0-omni-pro-image-to-video', 'kling-v3.0-omni-pro-text-to-video',
      'kling-v3.0-omni-standard-image-to-video', 'kling-v3.0-omni-standard-text-to-video'
    ],
    preferredProvider: 'kling',
    baseCredits: 45,
  },
  {
    targetId: 'kling-o1',
    name: '快手 可灵 O1',
    category: 'video',
    display_name: '快手 可灵 O1 全模态视觉模型',
    aliases: [
      'kling-o1-text-to-video', 'kling-o1-image-to-video', 'kling-o1-reference-to-video',
      'kling-o1-standard-image-to-video', 'kling-o1-standard-reference-to-video',
      'kling-o1-video-edit', 'kling-o1-video-edit-fast', 'kling-o1-standard-video-edit',
      'kling-o1-text-to-image', 'kling-o1-edit-image'
    ],
    preferredProvider: 'kling',
    baseCredits: 40,
  },

  // === MiniMax / 海螺 ===
  {
    targetId: 'hailuo-02',
    name: 'MiniMax 海螺 02',
    category: 'video',
    display_name: 'MiniMax 海螺 02 (原生高拟真动态)',
    aliases: ['minimax-hailuo-02', 'minimax-video-01-live', 'minimax-video-01'],
    preferredProvider: 'minimax',
    baseCredits: 28,
  },
  {
    targetId: 'hailuo-2.3',
    name: 'MiniMax 海螺 2.3',
    category: 'video',
    display_name: 'MiniMax 海螺 2.3 电影级视频生成',
    aliases: ['minimax-hailuo-2.3-standard-t2v', 'minimax-hailuo-2.3-standard-i2v', 'minimax-hailuo-2.3'],
    preferredProvider: 'minimax',
    baseCredits: 30,
  },
  {
    targetId: 'minimax-speech-2.6',
    name: 'MiniMax 语音 2.6',
    category: 'audio',
    display_name: 'MiniMax 语音合成 2.6 (高清拟真/情感表现)',
    aliases: ['minimax-speech-2.6-hd', 'minimax-speech-2.6-turbo'],
    preferredProvider: 'minimax',
    baseCredits: 12,
  },
  {
    targetId: 'minimax-voice-clone',
    name: 'MiniMax 声音克隆',
    category: 'audio',
    display_name: 'MiniMax 零样本声音复刻',
    aliases: [],
    preferredProvider: 'minimax',
    baseCredits: 25,
  },

  // === 阿里百炼 / DashScope (Wan 万相) ===
  {
    targetId: 'wan-2.1',
    name: '阿里 万相 2.1',
    category: 'video',
    display_name: '阿里 万相 2.1 (通义万相多模态矩阵)',
    aliases: ['wan2.1-text-to-image', 'wan2.1-image-to-video', 'wan2.1-t2v-14b', 'wan2.1-i2v-14b', 'wanx2.1-t2v-plus'],
    preferredProvider: 'alibaba',
    baseCredits: 26,
  },
  {
    targetId: 'wan-2.2',
    name: '阿里 万相 2.2',
    category: 'video',
    display_name: '阿里 万相 2.2 视频编辑与特效',
    aliases: ['wan2.2-image-to-video', 'wan2.2-edit-video'],
    preferredProvider: 'alibaba',
    baseCredits: 30,
  },

  // === 字节跳动 / 火山引擎 / BytePlus (Seedream & Seedance) ===
  {
    targetId: 'seedream-5.0',
    name: 'Seedream 5.0',
    category: 'image',
    display_name: '字节跳动 Seedream 5.0 (商业摄影质感)',
    aliases: ['bytedance-seedream-5.0-pro', 'bytedance-seedream-5.0-pro-edit', 'bytedance-seedream-v5.0'],
    preferredProvider: 'volcengine',
    baseCredits: 15,
  },
  {
    targetId: 'seedream-5.0-edit',
    name: 'Seedream 5.0 Edit',
    category: 'image',
    display_name: '字节跳动 Seedream 5.0 智能改图重绘',
    aliases: ['bytedance-seedream-v5.0-edit'],
    preferredProvider: 'volcengine',
    baseCredits: 15,
  },
  {
    targetId: 'seedream-4.5',
    name: 'Seedream 4.5',
    category: 'image',
    display_name: '字节跳动 Seedream 4.5',
    aliases: ['bytedance-seedream-v4.5', 'bytedance-seedream-v4.5-edit'],
    preferredProvider: 'byteplus',
    baseCredits: 12,
  },
  {
    targetId: 'seedream-4.0',
    name: 'Seedream 4.0',
    category: 'image',
    display_name: '字节跳动 Seedream 4.0',
    aliases: ['bytedance-seedream-v4', 'bytedance-seedream-v4-edit', 'bytedance-seedream-edit-v4'],
    preferredProvider: 'byteplus',
    baseCredits: 10,
  },
  {
    targetId: 'seedream-3.0',
    name: 'Seedream 3.0',
    category: 'image',
    display_name: '字节跳动 Seedream 3.0',
    aliases: ['bytedance-seedream-v3'],
    preferredProvider: 'muapi',
    baseCredits: 8,
  },
  {
    targetId: 'seedance-2.0',
    name: 'Seedance 2.0',
    category: 'video',
    display_name: '字节跳动 Seedance 2.0 动态视频',
    aliases: ['seedance-v2.0-t2v', 'seedance-v2.0-i2v', 'bytedance-seedance-2.0'],
    preferredProvider: 'byteplus',
    baseCredits: 28,
  },
  {
    targetId: 'seedance-2.5',
    name: 'Seedance 2.5',
    category: 'video',
    display_name: '字节跳动 Seedance 2.5 影视运镜',
    aliases: ['seedance-2.5-image-to-video'],
    preferredProvider: 'byteplus',
    baseCredits: 32,
  },
  {
    targetId: 'seedance-1.5',
    name: 'Seedance 1.5',
    category: 'video',
    display_name: '字节跳动 Seedance 1.5 Pro',
    aliases: ['seedance-1.5-pro'],
    preferredProvider: 'byteplus',
    baseCredits: 22,
  },

  // === Google / Veo ===
  {
    targetId: 'veo-2',
    name: 'Google Veo 2',
    category: 'video',
    display_name: 'Google Veo 2 电影级高清视频',
    aliases: ['veo-2-text-to-video', 'veo-2-image-to-video'],
    preferredProvider: 'google',
    baseCredits: 38,
  },
  {
    targetId: 'veo-3',
    name: 'Google Veo 3',
    category: 'video',
    display_name: 'Google Veo 3 下一代极速渲染',
    aliases: ['veo3-fast-image-to-video', 'veo3-fast-text-to-video', 'veo-3-fast'],
    preferredProvider: 'google',
    baseCredits: 48,
  },
  {
    targetId: 'imagen-4',
    name: 'Google Imagen 4',
    category: 'image',
    display_name: 'Google Imagen 4 超清生图',
    aliases: ['google-imagen-4'],
    preferredProvider: 'google',
    baseCredits: 16,
  },
  {
    targetId: 'gemini-omni-flash',
    name: 'Gemini Omni Flash',
    category: 'video',
    display_name: 'Google Gemini Omni Flash 1.1 实时交互视频',
    aliases: [
      'gemini-omni-flash-1-1-text-to-video', 'gemini-omni-flash-1-1-image-to-video',
      'gemini-omni-flash-1-1-reference-to-video', 'gemini-omni-flash-1-1-edit',
      'gemini-omni-image-to-video', 'gemini-omni-text-to-video'
    ],
    preferredProvider: 'google',
    baseCredits: 35,
  },

  // === OpenAI / ChatGPT ===
  {
    targetId: 'gpt-image',
    name: 'GPT Image (DALL·E 3 / GPT-4o)',
    category: 'image',
    display_name: 'OpenAI GPT Image (DALL·E 3 / GPT-4o)',
    aliases: ['gpt4o-text-to-image', 'gpt4o-image-to-image', 'gpt4o-edit'],
    preferredProvider: 'openai',
    baseCredits: 18,
  },
  {
    targetId: 'sora-turbo',
    name: 'OpenAI Sora Turbo',
    category: 'video',
    display_name: 'OpenAI Sora Turbo 物理世界模拟',
    aliases: ['openai-sora-turbo', 'sora-video', 'openai-sora'],
    preferredProvider: 'openai',
    baseCredits: 50,
  },

  // === FLUX (Black Forest Labs) ===
  {
    targetId: 'flux-1-dev',
    name: 'FLUX.1 Dev',
    category: 'image',
    display_name: 'FLUX.1 Dev 开源旗舰质感',
    aliases: ['flux-kontext-dev-t2i', 'flux-kontext-dev-i2i'],
    preferredProvider: 'muapi',
    baseCredits: 14,
  },
  {
    targetId: 'flux-1-pro',
    name: 'FLUX.1 Pro',
    category: 'image',
    display_name: 'FLUX.1 Pro 顶级专业画质',
    aliases: ['flux-pro', 'flux-kontext-pro-t2i', 'flux-kontext-pro-i2i'],
    preferredProvider: 'openai',
    baseCredits: 20,
  },
  {
    targetId: 'flux-1.1-pro',
    name: 'FLUX 1.1 Pro',
    category: 'image',
    display_name: 'FLUX 1.1 Pro 电影质感摄影',
    aliases: ['flux-1.1-pro-ultra'],
    preferredProvider: 'openai',
    baseCredits: 24,
  },
  {
    targetId: 'flux-3',
    name: 'FLUX.3 Video',
    category: 'video',
    display_name: 'FLUX 3.0 下一代视频渲染',
    aliases: ['flux-3-text-to-video', 'flux-3-image-to-video'],
    preferredProvider: 'muapi',
    baseCredits: 35,
  },

  // === Runway ===
  {
    targetId: 'runway-image-to-video',
    name: 'Runway Gen-3',
    category: 'video',
    display_name: 'Runway Gen-3 Alpha 电影级视频生成',
    aliases: ['runway-aleph-v2v', 'runway-act-two-recast', 'runway-gen-3'],
    preferredProvider: 'runway',
    baseCredits: 35,
  },

  // === Luma ===
  {
    targetId: 'luma-dream-machine',
    name: 'Luma Dream Machine',
    category: 'video',
    display_name: 'Luma Dream Machine (Ray 2 摄影流)',
    aliases: ['luma-ray-2'],
    preferredProvider: 'luma',
    baseCredits: 32,
  },

  // === Vidu ===
  {
    targetId: 'vidu-2.0',
    name: 'Vidu 2.0',
    category: 'video',
    display_name: 'Vidu 2.0 生数科技',
    aliases: ['vidu-2.0-t2v', 'vidu-2.0-i2v'],
    preferredProvider: 'muapi',
    baseCredits: 28,
  },

  // === Midjourney ===
  {
    targetId: 'midjourney-v7',
    name: 'Midjourney v7',
    category: 'image',
    display_name: 'Midjourney v7 极致艺术美学',
    aliases: ['midjourney-v7.0'],
    preferredProvider: 'muapi',
    baseCredits: 22,
  },
  {
    targetId: 'midjourney-v6.1',
    name: 'Midjourney v6.1',
    category: 'image',
    display_name: 'Midjourney v6.1 真实光影质感',
    aliases: [],
    preferredProvider: 'muapi',
    baseCredits: 18,
  },

  // === 腾讯混元 Hunyuan ===
  {
    targetId: 'hunyuan-video',
    name: '腾讯 混元 Video',
    category: 'video',
    display_name: '腾讯 混元开源视频大模型 (HunyuanVideo)',
    aliases: ['hunyuan-image-to-video', 'hunyuan-text-to-video'],
    preferredProvider: 'muapi',
    baseCredits: 25,
  },

  // === Grok ===
  {
    targetId: 'grok-imagine',
    name: 'xAI Grok Imagine',
    category: 'image',
    display_name: 'xAI Grok Imagine 全模态创作',
    aliases: [
      'grok-imagine-text-to-image', 'grok-imagine-image-to-image',
      'grok-imagine-text-to-video', 'grok-imagine-image-to-video'
    ],
    preferredProvider: 'muapi',
    baseCredits: 25,
  },

  // === InfiniteTalk 角色说话 ===
  {
    targetId: 'infinitetalk',
    name: 'InfiniteTalk 口型数字人',
    category: 'video',
    display_name: 'InfiniteTalk 极速口型驱动数字人',
    aliases: ['infinitetalk-image-to-video', 'infinitetalk-video-to-video'],
    preferredProvider: 'muapi',
    baseCredits: 20,
  }
];

export async function runDeduplicationAndPublish() {
  console.log('====================================================');
  console.log('🚀 开始全量模型去重、渠道迁移聚合与规范全部上架流程');
  console.log('====================================================');

  let mergedChannelsCount = 0;
  let archivedModelsCount = 0;
  let createdModelsCount = 0;
  let pricedModelsCount = 0;

  await withTransaction(async (tx) => {
    // -------------------------------------------------------------
    // 步骤 1：处理预设核心家族去重与渠道聚合
    // -------------------------------------------------------------
    for (const group of CANONICAL_GROUPS) {
      const { targetId, name, category, display_name, aliases, preferredProvider, baseCredits } = group;

      // 1. 确保目标规范模型存在且为 active 状态
      const existing = await tx.queryOne('SELECT * FROM ai_studio.ai_models WHERE id = $1', [targetId]);
      if (!existing) {
        await tx.execute(`
          INSERT INTO ai_studio.ai_models
            (id, slug, name, display_name, category, description, status, sort, is_featured, created_at, updated_at)
          VALUES ($1, $1, $2, $3, $4, $5, 'active', 10, true, now(), now())
          ON CONFLICT (id) DO UPDATE SET status = 'active', display_name = EXCLUDED.display_name, updated_at = now()
        `, [targetId, name, display_name, category, `${display_name} - 规范聚合模型`]);
        createdModelsCount++;
      } else {
        await tx.execute(`
          UPDATE ai_studio.ai_models
          SET status = 'active', display_name = $2, updated_at = now()
          WHERE id = $1
        `, [targetId, display_name]);
      }

      // 2. 将所有别名模型的渠道迁移到 targetId 下
      for (const aliasId of aliases) {
        const aliasModel = await tx.queryOne('SELECT * FROM ai_studio.ai_models WHERE id = $1', [aliasId]);
        if (!aliasModel) continue;

        // 获取该别名模型下的所有渠道
        const aliasChannels = await tx.queryMany(
          'SELECT * FROM ai_studio.provider_models WHERE model_id = $1',
          [aliasId]
        );

        for (const ch of aliasChannels) {
          // 检查 targetId 下是否已存在相同 provider_id + provider_model_id 的渠道
          const conflict = await tx.queryOne(
            'SELECT id FROM ai_studio.provider_models WHERE model_id = $1 AND provider_id = $2 AND provider_model_id = $3',
            [targetId, ch.provider_id, ch.provider_model_id]
          );

          if (!conflict) {
            // 安全改绑归属至规范模型
            await tx.execute(
              'UPDATE ai_studio.provider_models SET model_id = $1, updated_at = now() WHERE id = $2',
              [targetId, ch.id]
            );
            mergedChannelsCount++;
          } else {
            // 如果已存在，删除重复渠道
            await tx.execute('DELETE FROM ai_studio.provider_models WHERE id = $1', [ch.id]);
          }
        }

        // 将被合并的别名模型归档禁用
        await tx.execute(
          "UPDATE ai_studio.ai_models SET status = 'disabled', description = $2, updated_at = now() WHERE id = $1",
          [aliasId, `已合并至规范模型 [${targetId}]`]
        );
        archivedModelsCount++;
      }

      // 3. 规范模型的渠道主选 (Primary) 标记策略
      const targetChannels = await tx.queryMany(
        'SELECT id, provider_id, metadata FROM ai_studio.provider_models WHERE model_id = $1 ORDER BY priority DESC',
        [targetId]
      );

      if (targetChannels.length > 0) {
        // 查找是否有优先供应商
        let primaryCh = targetChannels.find((c) => c.provider_id === preferredProvider);
        if (!primaryCh) {
          // 官方渠道优先
          primaryCh = targetChannels.find((c) => ['kling', 'alibaba', 'minimax', 'volcengine', 'byteplus', 'google', 'openai', 'runway', 'luma'].includes(c.provider_id));
        }
        if (!primaryCh) {
          primaryCh = targetChannels[0];
        }

        // 清理其他渠道 primary 标记
        await tx.execute(`
          UPDATE ai_studio.provider_models
          SET metadata = COALESCE(metadata, '{}'::jsonb) - 'primary', updated_at = now()
          WHERE model_id = $1 AND id <> $2
        `, [targetId, primaryCh.id]);

        // 设置目标 primary
        await tx.execute(`
          UPDATE ai_studio.provider_models
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
              enabled = true,
              updated_at = now()
          WHERE id = $1
        `, [primaryCh.id]);
      }

      // 4. 确保定价策略存在
      await tx.execute(`
        INSERT INTO ai_studio.model_pricing
          (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
        VALUES
          ($1, $2, 'fixed', $3, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          base_credits = EXCLUDED.base_credits,
          is_active = true,
          updated_at = now()
      `, [`prc_${targetId.replace(/[-.]/g, '_')}`, targetId, baseCredits || 25]);

      // 5. 确保智能路由策略存在
      await tx.execute(`
        INSERT INTO ai_studio.routing_policies
          (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
        VALUES
          ($1, $2, 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb,
           '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          failover_enabled = true,
          updated_at = now()
      `, [`rp_${targetId.replace(/[-.]/g, '_')}`, targetId]);
    }

    // -------------------------------------------------------------
    // 步骤 2：全量上架检查：为全平台所有非 disabled 的模型补充定价与路由
    // -------------------------------------------------------------
    console.log('检查全量现存活跃模型，补充全量上架定价策略与容灾策略...');
    const allActiveModels = await tx.queryMany(
      "SELECT id, category, name FROM ai_studio.ai_models WHERE status != 'disabled'"
    );

    for (const m of allActiveModels) {
      // 确认有 pricing
      const p = await tx.queryOne('SELECT id FROM ai_studio.model_pricing WHERE model_id = $1', [m.id]);
      if (!p) {
        let defaultCredits = 25;
        if (m.category === 'video' || m.category === 'video_text' || m.category === 'video_image') defaultCredits = 30;
        else if (m.category === 'image' || m.category === 'image_edit') defaultCredits = 10;
        else if (m.category === 'audio') defaultCredits = 15;
        else if (m.category === 'text') defaultCredits = 5;

        await tx.execute(`
          INSERT INTO ai_studio.model_pricing
            (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
          VALUES
            ($1, $2, 'fixed', $3, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now())
          ON CONFLICT (model_id) DO UPDATE SET is_active = true, updated_at = now()
        `, [`prc_${m.id.replace(/[-.]/g, '_')}`, m.id, defaultCredits]);
        pricedModelsCount++;
      }

      // 确认有 routing policy
      await tx.execute(`
        INSERT INTO ai_studio.routing_policies
          (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
        VALUES
          ($1, $2, 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb,
           '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET failover_enabled = true, updated_at = now()
      `, [`rp_${m.id.replace(/[-.]/g, '_')}`, m.id]);

      // 确保至少有一个渠道被标记为 primary
      const chs = await tx.queryMany(
        'SELECT id, metadata FROM ai_studio.provider_models WHERE model_id = $1 ORDER BY priority DESC',
        [m.id]
      );
      if (chs.length > 0) {
        const hasPrimary = chs.some((c) => c.metadata && (c.metadata.primary === true || c.metadata.primary === 'true'));
        if (!hasPrimary) {
          await tx.execute(`
            UPDATE ai_studio.provider_models
            SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
                updated_at = now()
            WHERE id = $1
          `, [chs[0].id]);
        }
      }
    }
  });

  console.log('====================================================');
  console.log(`✅ 规范去重与全部上架执行完毕！`);
  console.log(`- 成功重定向聚合渠道数: ${mergedChannelsCount}`);
  console.log(`- 归档去重非规范模型数: ${archivedModelsCount}`);
  console.log(`- 全新规范模型创建数: ${createdModelsCount}`);
  console.log(`- 补齐上架定价与策略模型数: ${pricedModelsCount}`);
  console.log('====================================================');
}

// Direct script execution
if (process.argv[1] && process.argv[1].endsWith('deduplicate-and-publish-canonical-models.mjs')) {
  runDeduplicationAndPublish()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error during deduplication:', err);
      process.exit(1);
    });
}
