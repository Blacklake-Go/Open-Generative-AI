import 'server-only';
import { execute, queryMany, queryOne, withTransaction } from '../lib/db/index.js';

/**
 * 核心模型规范家族映射表 (Canonical Family Mappings)
 * 定义规范核心模型与旗下特定任务变体 / Studio 挂接模型之间的父子映射关系
 */
export const CANONICAL_FAMILY_MAP = [
  // === 快手可灵 Kling ===
  {
    targetId: 'kling-2.6',
    name: '快手 可灵 2.6',
    category: 'video',
    display_name: '快手 可灵 2.6 (电影画质/多渠道调度)',
    preferredProvider: 'kling',
    baseCredits: 35,
    variants: [
      { id: 'kling-v2.6-pro-t2v', name: '可灵 2.6 Pro 文生视频', category: 'video', provider_model_id: 'kling-v2.6-pro-t2v', official_provider_model_id: 'kling-v2-6-pro', base_cost: 0.05, baseCredits: 35 },
      { id: 'kling-v2.6-pro-i2v', name: '可灵 2.6 Pro 图生视频', category: 'video', provider_model_id: 'kling-v2.6-pro-i2v', official_provider_model_id: 'kling-v2-6-pro', base_cost: 0.05, baseCredits: 35 },
      { id: 'kling-v2.6-std-motion-control', name: '可灵 2.6 运动笔刷标准版', category: 'video', provider_model_id: 'kling-v2.6-std-motion-control', official_provider_model_id: 'kling-v2-6-motion', base_cost: 0.04, baseCredits: 30 },
      { id: 'kling-v2.6-pro-motion-control', name: '可灵 2.6 运动笔刷专业版', category: 'video', provider_model_id: 'kling-v2.6-pro-motion-control', official_provider_model_id: 'kling-v2-6-motion', base_cost: 0.05, baseCredits: 35 }
    ]
  },
  {
    targetId: 'kling-2.5',
    name: '快手 可灵 2.5',
    category: 'video',
    display_name: '快手 可灵 2.5 Turbo',
    preferredProvider: 'kling',
    baseCredits: 28,
    variants: [
      { id: 'kling-v2.5-turbo-pro-t2v', name: '可灵 2.5 Turbo 文生视频', category: 'video', provider_model_id: 'kling-v2.5-turbo-pro-t2v', official_provider_model_id: 'kling-v2-5-turbo', base_cost: 0.04, baseCredits: 28 },
      { id: 'kling-v2.5-turbo-pro-i2v', name: '可灵 2.5 Turbo 图生视频', category: 'video', provider_model_id: 'kling-v2.5-turbo-pro-i2v', official_provider_model_id: 'kling-v2-5-turbo', base_cost: 0.04, baseCredits: 28 }
    ]
  },
  {
    targetId: 'kling-2.1',
    name: '快手 可灵 2.1',
    category: 'video',
    display_name: '快手 可灵 2.1 Master',
    preferredProvider: 'kling',
    baseCredits: 25,
    variants: [
      { id: 'kling-v2.1-master-t2v', name: '可灵 2.1 Master 文生视频', category: 'video', provider_model_id: 'kling-v2.1-master-t2v', official_provider_model_id: 'kling-v2-1-master', base_cost: 0.035, baseCredits: 25 },
      { id: 'kling-v2.1-master-i2v', name: '可灵 2.1 Master 图生视频', category: 'video', provider_model_id: 'kling-v2.1-master-i2v', official_provider_model_id: 'kling-v2-1-master', base_cost: 0.035, baseCredits: 25 },
      { id: 'kling-v2.1-standard-i2v', name: '可灵 2.1 Standard 图生视频', category: 'video', provider_model_id: 'kling-v2.1-standard-i2v', official_provider_model_id: 'kling-v2-1-std', base_cost: 0.03, baseCredits: 20 }
    ]
  },
  {
    targetId: 'kling-3.0',
    name: '快手 可灵 3.0',
    category: 'video',
    display_name: '快手 可灵 3.0 Pro 旗舰全能',
    preferredProvider: 'kling',
    baseCredits: 45,
    variants: [
      { id: 'kling-3.0-pro', name: '可灵 3.0 Pro', category: 'video', provider_model_id: 'kling-3.0-pro', official_provider_model_id: 'kling-v3-0-pro', base_cost: 0.06, baseCredits: 45 },
      { id: 'kling-v3.0-standard-text-to-video', name: '可灵 3.0 标准版文生视频', category: 'video', provider_model_id: 'kling-v3.0-standard-text-to-video', official_provider_model_id: 'kling-v3-0-std', base_cost: 0.05, baseCredits: 40 },
      { id: 'kling-v3.0-standard-image-to-video', name: '可灵 3.0 标准版图生视频', category: 'video', provider_model_id: 'kling-v3.0-standard-image-to-video', official_provider_model_id: 'kling-v3-0-std-i2v', base_cost: 0.05, baseCredits: 40 },
      { id: 'kling-v3.0-pro-recast', name: '可灵 3.0 镜头重塑', category: 'video', provider_model_id: 'kling-v3.0-pro-recast', official_provider_model_id: 'kling-v3-0-recast', base_cost: 0.05, baseCredits: 40 },
      { id: 'kling-v3.0-4k-image-to-video', name: '可灵 3.0 4K 图生视频', category: 'video', provider_model_id: 'kling-v3.0-4k-image-to-video', official_provider_model_id: 'kling-v3-0-4k', base_cost: 0.07, baseCredits: 50 },
      { id: 'kling-v3.0-4k-text-to-video', name: '可灵 3.0 4K 文生视频', category: 'video', provider_model_id: 'kling-v3.0-4k-text-to-video', official_provider_model_id: 'kling-v3-0-4k', base_cost: 0.07, baseCredits: 50 },
      { id: 'kling-v3.0-omni-4k-image-to-video', name: '可灵 3.0 Omni 4K 图生视频', category: 'video', provider_model_id: 'kling-v3.0-omni-4k-image-to-video', official_provider_model_id: 'kling-v3-0-omni-4k', base_cost: 0.08, baseCredits: 55 },
      { id: 'kling-v3.0-omni-4k-text-to-video', name: '可灵 3.0 Omni 4K 文生视频', category: 'video', provider_model_id: 'kling-v3.0-omni-4k-text-to-video', official_provider_model_id: 'kling-v3-0-omni-4k', base_cost: 0.08, baseCredits: 55 },
      { id: 'kling-v3.0-omni-pro-image-to-video', name: '可灵 3.0 Omni Pro 图生视频', category: 'video', provider_model_id: 'kling-v3.0-omni-pro-image-to-video', official_provider_model_id: 'kling-v3-0-omni-pro', base_cost: 0.065, baseCredits: 48 },
      { id: 'kling-v3.0-omni-pro-text-to-video', name: '可灵 3.0 Omni Pro 文生视频', category: 'video', provider_model_id: 'kling-v3.0-omni-pro-text-to-video', official_provider_model_id: 'kling-v3-0-omni-pro', base_cost: 0.065, baseCredits: 48 },
      { id: 'kling-v3.0-omni-standard-image-to-video', name: '可灵 3.0 Omni 标准版图生视频', category: 'video', provider_model_id: 'kling-v3.0-omni-standard-image-to-video', official_provider_model_id: 'kling-v3-0-omni-std', base_cost: 0.05, baseCredits: 42 },
      { id: 'kling-v3.0-omni-standard-text-to-video', name: '可灵 3.0 Omni 标准版文生视频', category: 'video', provider_model_id: 'kling-v3.0-omni-standard-text-to-video', official_provider_model_id: 'kling-v3-0-omni-std', base_cost: 0.05, baseCredits: 42 }
    ]
  },
  {
    targetId: 'kling-o1',
    name: '快手 可灵 O1',
    category: 'video',
    display_name: '快手 可灵 O1 全模态视觉模型',
    preferredProvider: 'kling',
    baseCredits: 40,
    variants: [
      { id: 'kling-o1-text-to-video', name: '可灵 O1 文生视频', category: 'video', provider_model_id: 'kling-o1-text-to-video', official_provider_model_id: 'kling-o1-t2v', base_cost: 0.055, baseCredits: 40 },
      { id: 'kling-o1-image-to-video', name: '可灵 O1 图生视频', category: 'video', provider_model_id: 'kling-o1-image-to-video', official_provider_model_id: 'kling-o1-i2v', base_cost: 0.055, baseCredits: 40 },
      { id: 'kling-o1-reference-to-video', name: '可灵 O1 多参考生视频', category: 'video', provider_model_id: 'kling-o1-reference-to-video', official_provider_model_id: 'kling-o1-ref', base_cost: 0.06, baseCredits: 45 },
      { id: 'kling-o1-standard-image-to-video', name: '可灵 O1 标准图生视频', category: 'video', provider_model_id: 'kling-o1-standard-image-to-video', official_provider_model_id: 'kling-o1-std-i2v', base_cost: 0.05, baseCredits: 38 },
      { id: 'kling-o1-standard-reference-to-video', name: '可灵 O1 标准多参考生视频', category: 'video', provider_model_id: 'kling-o1-standard-reference-to-video', official_provider_model_id: 'kling-o1-std-ref', base_cost: 0.05, baseCredits: 38 },
      { id: 'kling-o1-video-edit', name: '可灵 O1 视频重塑编辑', category: 'video', provider_model_id: 'kling-o1-video-edit', official_provider_model_id: 'kling-o1-edit', base_cost: 0.055, baseCredits: 40 },
      { id: 'kling-o1-video-edit-fast', name: '可灵 O1 极速视频编辑', category: 'video', provider_model_id: 'kling-o1-video-edit-fast', official_provider_model_id: 'kling-o1-edit-fast', base_cost: 0.045, baseCredits: 35 },
      { id: 'kling-o1-standard-video-edit', name: '可灵 O1 标准视频编辑', category: 'video', provider_model_id: 'kling-o1-standard-video-edit', official_provider_model_id: 'kling-o1-std-edit', base_cost: 0.05, baseCredits: 38 },
      { id: 'kling-o1-text-to-image', name: '可灵 O1 文生图', category: 'image', provider_model_id: 'kling-o1-text-to-image', official_provider_model_id: 'kling-o1-t2i', base_cost: 0.025, baseCredits: 18 },
      { id: 'kling-o1-edit-image', name: '可灵 O1 图像改图', category: 'image', provider_model_id: 'kling-o1-edit-image', official_provider_model_id: 'kling-o1-i2i', base_cost: 0.025, baseCredits: 18 }
    ]
  },

  // === MiniMax / 海螺 ===
  {
    targetId: 'hailuo-02',
    name: 'MiniMax 海螺 02',
    category: 'video',
    display_name: 'MiniMax 海螺 02 (原生高拟真动态)',
    preferredProvider: 'minimax',
    baseCredits: 28,
    variants: [
      { id: 'minimax-hailuo-02', name: 'MiniMax 海螺 02', category: 'video', provider_model_id: 'minimax-hailuo-02', official_provider_model_id: 'video-01-director', base_cost: 0.04, baseCredits: 28 },
      { id: 'minimax-video-01-live', name: 'MiniMax 动作微调 01', category: 'video', provider_model_id: 'minimax-video-01-live', official_provider_model_id: 'video-01-live', base_cost: 0.04, baseCredits: 28 },
      { id: 'minimax-video-01', name: 'MiniMax Video 01 经典', category: 'video', provider_model_id: 'minimax-video-01', official_provider_model_id: 'video-01', base_cost: 0.035, baseCredits: 25 }
    ]
  },
  {
    targetId: 'hailuo-2.3',
    name: 'MiniMax 海螺 2.3',
    category: 'video',
    display_name: 'MiniMax 海螺 2.3 电影级视频生成',
    preferredProvider: 'minimax',
    baseCredits: 30,
    variants: [
      { id: 'minimax-hailuo-2.3-standard-t2v', name: '海螺 2.3 文生视频', category: 'video', provider_model_id: 'minimax-hailuo-2.3-standard-t2v', official_provider_model_id: 'video-2.3-t2v', base_cost: 0.045, baseCredits: 30 },
      { id: 'minimax-hailuo-2.3-standard-i2v', name: '海螺 2.3 图生视频', category: 'video', provider_model_id: 'minimax-hailuo-2.3-standard-i2v', official_provider_model_id: 'video-2.3-i2v', base_cost: 0.045, baseCredits: 30 },
      { id: 'minimax-hailuo-2.3', name: 'MiniMax 海螺 2.3', category: 'video', provider_model_id: 'minimax-hailuo-2.3', official_provider_model_id: 'video-2.3', base_cost: 0.045, baseCredits: 30 }
    ]
  },
  {
    targetId: 'minimax-speech-2.6',
    name: 'MiniMax 语音 2.6',
    category: 'audio',
    display_name: 'MiniMax 语音合成 2.6 (高清拟真/情感表现)',
    preferredProvider: 'minimax',
    baseCredits: 12,
    variants: [
      { id: 'minimax-speech-2.6-hd', name: 'MiniMax 语音 2.6 HD', category: 'audio', provider_model_id: 'minimax-speech-2.6-hd', official_provider_model_id: 'speech-01-hd', base_cost: 0.015, baseCredits: 12 },
      { id: 'minimax-speech-2.6-turbo', name: 'MiniMax 语音 2.6 Turbo', category: 'audio', provider_model_id: 'minimax-speech-2.6-turbo', official_provider_model_id: 'speech-01-turbo', base_cost: 0.012, baseCredits: 10 }
    ]
  },

  // === 阿里百炼 / DashScope (Wan 万相) ===
  {
    targetId: 'wan-2.1',
    name: '阿里 万相 2.1',
    category: 'video',
    display_name: '阿里 万相 2.1 (通义万相多模态矩阵)',
    preferredProvider: 'alibaba',
    baseCredits: 26,
    variants: [
      { id: 'wan2.1-text-to-image', name: '万相 2.1 文生图', category: 'image', provider_model_id: 'wan2.1-text-to-image', official_provider_model_id: 'wanx2.1-t2i-turbo', base_cost: 0.02, baseCredits: 15 },
      { id: 'wan2.1-image-to-video', name: '万相 2.1 图生视频', category: 'video', provider_model_id: 'wan2.1-image-to-video', official_provider_model_id: 'wanx2.1-i2v-plus', base_cost: 0.038, baseCredits: 26 },
      { id: 'wan2.1-t2v-14b', name: '万相 2.1 14B 文生视频', category: 'video', provider_model_id: 'wan2.1-t2v-14b', official_provider_model_id: 'wanx2.1-t2v-14b', base_cost: 0.038, baseCredits: 26 },
      { id: 'wan2.1-i2v-14b', name: '万相 2.1 14B 图生视频', category: 'video', provider_model_id: 'wan2.1-i2v-14b', official_provider_model_id: 'wanx2.1-i2v-14b', base_cost: 0.038, baseCredits: 26 }
    ]
  },
  {
    targetId: 'wan-2.2',
    name: '阿里 万相 2.2',
    category: 'video',
    display_name: '阿里 万相 2.2 视频编辑与特效',
    preferredProvider: 'alibaba',
    baseCredits: 30,
    variants: [
      { id: 'wan2.2-image-to-video', name: '万相 2.2 图生视频', category: 'video', provider_model_id: 'wan2.2-image-to-video', official_provider_model_id: 'wanx2.2-i2v-plus', base_cost: 0.045, baseCredits: 30 },
      { id: 'wan2.2-edit-video', name: '万相 2.2 视频风格转绘', category: 'video', provider_model_id: 'wan2.2-edit-video', official_provider_model_id: 'wanx2.2-edit', base_cost: 0.045, baseCredits: 30 }
    ]
  },

  // === 字节跳动 / 火山引擎 / BytePlus (Seedream & Seedance) ===
  {
    targetId: 'seedream-5.0',
    name: 'Seedream 5.0',
    category: 'image',
    display_name: '字节跳动 Seedream 5.0 (商业摄影质感)',
    preferredProvider: 'volcengine',
    baseCredits: 15,
    variants: [
      { id: 'bytedance-seedream-5.0-pro', name: '字节跳动 Seedream 5.0 Pro', category: 'image', provider_model_id: 'bytedance-seedream-5.0-pro', official_provider_model_id: 'seedream-5.0', base_cost: 0.025, baseCredits: 15 },
      { id: 'bytedance-seedream-5.0-pro-edit', name: '字节跳动 Seedream 5.0 Pro 改图', category: 'image', provider_model_id: 'bytedance-seedream-5.0-pro-edit', official_provider_model_id: 'seedream-5.0', base_cost: 0.025, baseCredits: 15 },
      { id: 'bytedance-seedream-v5.0', name: '字节跳动 Seedream v5.0', category: 'image', provider_model_id: 'bytedance-seedream-v5.0', official_provider_model_id: 'seedream-5.0', base_cost: 0.025, baseCredits: 15 },
      { id: 'bytedance-seedream-v5.0-edit', name: '字节跳动 Seedream v5.0 改图', category: 'image', provider_model_id: 'bytedance-seedream-v5.0-edit', official_provider_model_id: 'seedream-5.0', base_cost: 0.025, baseCredits: 15 }
    ]
  },
  {
    targetId: 'seedream-4.5',
    name: 'Seedream 4.5',
    category: 'image',
    display_name: '字节跳动 Seedream 4.5',
    preferredProvider: 'byteplus',
    baseCredits: 12,
    variants: [
      { id: 'bytedance-seedream-v4.5', name: '字节跳动 Seedream v4.5', category: 'image', provider_model_id: 'bytedance-seedream-v4.5', official_provider_model_id: 'seedream-4.5', base_cost: 0.02, baseCredits: 12 },
      { id: 'bytedance-seedream-v4.5-edit', name: '字节跳动 Seedream v4.5 改图', category: 'image', provider_model_id: 'bytedance-seedream-v4.5-edit', official_provider_model_id: 'seedream-4.5', base_cost: 0.02, baseCredits: 12 }
    ]
  },
  {
    targetId: 'seedream-4.0',
    name: 'Seedream 4.0',
    category: 'image',
    display_name: '字节跳动 Seedream 4.0',
    preferredProvider: 'byteplus',
    baseCredits: 10,
    variants: [
      { id: 'bytedance-seedream-v4', name: '字节跳动 Seedream v4', category: 'image', provider_model_id: 'bytedance-seedream-v4', official_provider_model_id: 'seedream-4.0', base_cost: 0.015, baseCredits: 10 },
      { id: 'bytedance-seedream-v4-edit', name: '字节跳动 Seedream v4 改图', category: 'image', provider_model_id: 'bytedance-seedream-v4-edit', official_provider_model_id: 'seedream-4.0', base_cost: 0.015, baseCredits: 10 },
      { id: 'bytedance-seedream-edit-v4', name: '字节跳动 Seedream Edit v4', category: 'image', provider_model_id: 'bytedance-seedream-edit-v4', official_provider_model_id: 'seedream-4.0', base_cost: 0.015, baseCredits: 10 }
    ]
  },
  {
    targetId: 'seedance-2.0',
    name: 'Seedance 2.0',
    category: 'video',
    display_name: '字节跳动 Seedance 2.0 动态视频',
    preferredProvider: 'byteplus',
    baseCredits: 28,
    variants: [
      { id: 'seedance-v2.0-t2v', name: '字节跳动 Seedance 2.0 文生视频', category: 'video', provider_model_id: 'seedance-v2.0-t2v', official_provider_model_id: 'seedance-2.0', base_cost: 0.04, baseCredits: 28 },
      { id: 'seedance-v2.0-i2v', name: '字节跳动 Seedance 2.0 图生视频', category: 'video', provider_model_id: 'seedance-v2.0-i2v', official_provider_model_id: 'seedance-2.0', base_cost: 0.04, baseCredits: 28 }
    ]
  },
  {
    targetId: 'seedance-2.5',
    name: 'Seedance 2.5',
    category: 'video',
    display_name: '字节跳动 Seedance 2.5 影视运镜',
    preferredProvider: 'byteplus',
    baseCredits: 32,
    variants: [
      { id: 'seedance-2.5-image-to-video', name: '字节跳动 Seedance 2.5 图生视频', category: 'video', provider_model_id: 'seedance-2.5-image-to-video', official_provider_model_id: 'seedance-2.5', base_cost: 0.045, baseCredits: 32 }
    ]
  },

  // === Google / Veo ===
  {
    targetId: 'veo-2',
    name: 'Google Veo 2',
    category: 'video',
    display_name: 'Google Veo 2 电影级高清视频',
    preferredProvider: 'google',
    baseCredits: 38,
    variants: [
      { id: 'veo-2-text-to-video', name: 'Google Veo 2 文生视频', category: 'video', provider_model_id: 'veo-2-text-to-video', official_provider_model_id: 'veo-2.0-generate-001', base_cost: 0.05, baseCredits: 38 },
      { id: 'veo-2-image-to-video', name: 'Google Veo 2 图生视频', category: 'video', provider_model_id: 'veo-2-image-to-video', official_provider_model_id: 'veo-2.0-i2v-001', base_cost: 0.05, baseCredits: 38 }
    ]
  },
  {
    targetId: 'veo-3',
    name: 'Google Veo 3',
    category: 'video',
    display_name: 'Google Veo 3 下一代极速渲染',
    preferredProvider: 'google',
    baseCredits: 48,
    variants: [
      { id: 'veo3-fast-text-to-video', name: 'Google Veo 3 Fast 文生视频', category: 'video', provider_model_id: 'veo3-fast-text-to-video', official_provider_model_id: 'veo-3.0-generate-001', base_cost: 0.065, baseCredits: 48 },
      { id: 'veo3-fast-image-to-video', name: 'Google Veo 3 Fast 图生视频', category: 'video', provider_model_id: 'veo3-fast-image-to-video', official_provider_model_id: 'veo-3.0-i2v-001', base_cost: 0.065, baseCredits: 48 }
    ]
  },
  {
    targetId: 'gemini-omni-flash',
    name: 'Gemini Omni Flash',
    category: 'video',
    display_name: 'Google Gemini Omni Flash 1.1 实时交互视频',
    preferredProvider: 'google',
    baseCredits: 35,
    variants: [
      { id: 'gemini-omni-flash-1-1-text-to-video', name: 'Gemini Omni Flash 1.1 文生视频', category: 'video', provider_model_id: 'gemini-omni-flash-1-1-text-to-video', official_provider_model_id: 'gemini-omni-flash', base_cost: 0.045, baseCredits: 35 },
      { id: 'gemini-omni-flash-1-1-image-to-video', name: 'Gemini Omni Flash 1.1 图生视频', category: 'video', provider_model_id: 'gemini-omni-flash-1-1-image-to-video', official_provider_model_id: 'gemini-omni-flash', base_cost: 0.045, baseCredits: 35 },
      { id: 'gemini-omni-flash-1-1-reference-to-video', name: 'Gemini Omni Flash 1.1 参考生视频', category: 'video', provider_model_id: 'gemini-omni-flash-1-1-reference-to-video', official_provider_model_id: 'gemini-omni-flash', base_cost: 0.045, baseCredits: 35 },
      { id: 'gemini-omni-flash-1-1-edit', name: 'Gemini Omni Flash 1.1 视频编辑', category: 'video', provider_model_id: 'gemini-omni-flash-1-1-edit', official_provider_model_id: 'gemini-omni-flash', base_cost: 0.045, baseCredits: 35 },
      { id: 'gemini-omni-image-to-video', name: 'Gemini Omni 图生视频', category: 'video', provider_model_id: 'gemini-omni-image-to-video', official_provider_model_id: 'gemini-omni-flash', base_cost: 0.045, baseCredits: 35 },
      { id: 'gemini-omni-text-to-video', name: 'Gemini Omni 文生视频', category: 'video', provider_model_id: 'gemini-omni-text-to-video', official_provider_model_id: 'gemini-omni-flash', base_cost: 0.045, baseCredits: 35 }
    ]
  },

  // === OpenAI / ChatGPT ===
  {
    targetId: 'gpt-image',
    name: 'GPT Image (DALL·E 3 / GPT-4o)',
    category: 'image',
    display_name: 'OpenAI GPT Image (DALL·E 3 / GPT-4o)',
    preferredProvider: 'openai',
    baseCredits: 18,
    variants: [
      { id: 'gpt4o-text-to-image', name: 'GPT-4o 文生图', category: 'image', provider_model_id: 'gpt4o-text-to-image', official_provider_model_id: 'dall-e-3', base_cost: 0.03, baseCredits: 18 },
      { id: 'gpt4o-image-to-image', name: 'GPT-4o 图生图', category: 'image', provider_model_id: 'gpt4o-image-to-image', official_provider_model_id: 'dall-e-3', base_cost: 0.03, baseCredits: 18 },
      { id: 'gpt4o-edit', name: 'GPT-4o 图像局部重绘', category: 'image', provider_model_id: 'gpt4o-edit', official_provider_model_id: 'dall-e-3', base_cost: 0.03, baseCredits: 18 }
    ]
  },
  {
    targetId: 'sora-turbo',
    name: 'OpenAI Sora Turbo',
    category: 'video',
    display_name: 'OpenAI Sora Turbo 物理世界模拟',
    preferredProvider: 'openai',
    baseCredits: 50,
    variants: [
      { id: 'openai-sora', name: 'OpenAI Sora', category: 'video', provider_model_id: 'openai-sora', official_provider_model_id: 'sora-1.0', base_cost: 0.08, baseCredits: 50 },
      { id: 'openai-sora-2-text-to-video', name: 'OpenAI Sora 2 文生视频', category: 'video', provider_model_id: 'openai-sora-2-text-to-video', official_provider_model_id: 'sora-2.0', base_cost: 0.09, baseCredits: 55 },
      { id: 'openai-sora-2-image-to-video', name: 'OpenAI Sora 2 图生视频', category: 'video', provider_model_id: 'openai-sora-2-image-to-video', official_provider_model_id: 'sora-2.0', base_cost: 0.09, baseCredits: 55 },
      { id: 'openai-sora-2-pro-text-to-video', name: 'OpenAI Sora 2 Pro 文生视频', category: 'video', provider_model_id: 'openai-sora-2-pro-text-to-video', official_provider_model_id: 'sora-2.0-pro', base_cost: 0.12, baseCredits: 65 },
      { id: 'openai-sora-2-pro-image-to-video', name: 'OpenAI Sora 2 Pro 图生视频', category: 'video', provider_model_id: 'openai-sora-2-pro-image-to-video', official_provider_model_id: 'sora-2.0-pro', base_cost: 0.12, baseCredits: 65 }
    ]
  },

  // === FLUX (Black Forest Labs) ===
  {
    targetId: 'flux-1-dev',
    name: 'FLUX.1 Dev',
    category: 'image',
    display_name: 'FLUX.1 Dev 开源旗舰质感',
    preferredProvider: 'muapi',
    baseCredits: 14,
    variants: [
      { id: 'flux-kontext-dev-t2i', name: 'FLUX.1 Dev 文生图', category: 'image', provider_model_id: 'flux-kontext-dev-t2i', base_cost: 0.02, baseCredits: 14 },
      { id: 'flux-kontext-dev-i2i', name: 'FLUX.1 Dev 图生图', category: 'image', provider_model_id: 'flux-kontext-dev-i2i', base_cost: 0.02, baseCredits: 14 }
    ]
  },
  {
    targetId: 'flux-1-pro',
    name: 'FLUX.1 Pro',
    category: 'image',
    display_name: 'FLUX.1 Pro 顶级专业画质',
    preferredProvider: 'openai',
    baseCredits: 20,
    variants: [
      { id: 'flux-pro', name: 'FLUX.1 Pro 原版', category: 'image', provider_model_id: 'flux-pro', base_cost: 0.03, baseCredits: 20 },
      { id: 'flux-kontext-pro-t2i', name: 'FLUX.1 Pro 文生图', category: 'image', provider_model_id: 'flux-kontext-pro-t2i', base_cost: 0.03, baseCredits: 20 },
      { id: 'flux-kontext-pro-i2i', name: 'FLUX.1 Pro 图生图', category: 'image', provider_model_id: 'flux-kontext-pro-i2i', base_cost: 0.03, baseCredits: 20 }
    ]
  },
  {
    targetId: 'flux-3',
    name: 'FLUX.3 Video',
    category: 'video',
    display_name: 'FLUX 3.0 下一代视频渲染',
    preferredProvider: 'muapi',
    baseCredits: 35,
    variants: [
      { id: 'flux-3-text-to-video', name: 'FLUX 3 文生视频', category: 'video', provider_model_id: 'flux-3-text-to-video', base_cost: 0.05, baseCredits: 35 },
      { id: 'flux-3-image-to-video', name: 'FLUX 3 图生视频', category: 'video', provider_model_id: 'flux-3-image-to-video', base_cost: 0.05, baseCredits: 35 }
    ]
  },

  // === Runway ===
  {
    targetId: 'runway-image-to-video',
    name: 'Runway Gen-3',
    category: 'video',
    display_name: 'Runway Gen-3 Alpha 电影级视频生成',
    preferredProvider: 'runway',
    baseCredits: 35,
    variants: [
      { id: 'runway-aleph-v2v', name: 'Runway Aleph 视频转绘', category: 'video', provider_model_id: 'runway-aleph-v2v', official_provider_model_id: 'gen3a_turbo', base_cost: 0.05, baseCredits: 35 },
      { id: 'runway-act-two-recast', name: 'Runway Act-Two 角色迁移', category: 'video', provider_model_id: 'runway-act-two-recast', official_provider_model_id: 'act_two', base_cost: 0.05, baseCredits: 35 }
    ]
  },

  // === 腾讯混元 Hunyuan ===
  {
    targetId: 'hunyuan-video',
    name: '腾讯 混元 Video',
    category: 'video',
    display_name: '腾讯 混元开源视频大模型 (HunyuanVideo)',
    preferredProvider: 'muapi',
    baseCredits: 25,
    variants: [
      { id: 'hunyuan-text-to-video', name: '腾讯混元 文生视频', category: 'video', provider_model_id: 'hunyuan-text-to-video', base_cost: 0.035, baseCredits: 25 },
      { id: 'hunyuan-image-to-video', name: '腾讯混元 图生视频', category: 'video', provider_model_id: 'hunyuan-image-to-video', base_cost: 0.035, baseCredits: 25 }
    ]
  },

  // === Grok ===
  {
    targetId: 'grok-imagine',
    name: 'xAI Grok Imagine',
    category: 'image',
    display_name: 'xAI Grok Imagine 全模态创作',
    preferredProvider: 'muapi',
    baseCredits: 25,
    variants: [
      { id: 'grok-imagine-text-to-image', name: 'Grok Imagine 文生图', category: 'image', provider_model_id: 'grok-imagine-text-to-image', base_cost: 0.025, baseCredits: 18 },
      { id: 'grok-imagine-image-to-image', name: 'Grok Imagine 图生图', category: 'image', provider_model_id: 'grok-imagine-image-to-image', base_cost: 0.025, baseCredits: 18 },
      { id: 'grok-imagine-text-to-video', name: 'Grok Imagine 文生视频', category: 'video', provider_model_id: 'grok-imagine-text-to-video', base_cost: 0.045, baseCredits: 30 },
      { id: 'grok-imagine-image-to-video', name: 'Grok Imagine 图生视频', category: 'video', provider_model_id: 'grok-imagine-image-to-video', base_cost: 0.045, baseCredits: 30 }
    ]
  },

  // === InfiniteTalk 角色说话 ===
  {
    targetId: 'infinitetalk',
    name: 'InfiniteTalk 口型数字人',
    category: 'video',
    display_name: 'InfiniteTalk 极速口型驱动数字人',
    preferredProvider: 'muapi',
    baseCredits: 20,
    variants: [
      { id: 'infinitetalk-image-to-video', name: 'InfiniteTalk 静态照片驱动口型', category: 'video', provider_model_id: 'infinitetalk-image-to-video', base_cost: 0.03, baseCredits: 20 },
      { id: 'infinitetalk-video-to-video', name: 'InfiniteTalk 视频口型同步重绘', category: 'video', provider_model_id: 'infinitetalk-video-to-video', base_cost: 0.03, baseCredits: 20 }
    ]
  }
];

/**
 * 补充市面上主流缺失模型 (Mainstream Missing Models)
 */
export const ADDITIONAL_MAINSTREAM_MODELS = [
  {
    id: 'dall-e-3',
    name: 'OpenAI DALL·E 3',
    display_name: 'OpenAI DALL·E 3 官方旗舰生图',
    category: 'image',
    baseCredits: 18,
    channels: [
      { provider_id: 'openai', provider_model_id: 'dall-e-3', base_cost: 0.04, is_primary: true },
      { provider_id: 'muapi', provider_model_id: 'gpt4o-text-to-image', base_cost: 0.03, is_primary: false }
    ]
  },
  {
    id: 'pika-2.1',
    name: 'Pika 2.1',
    display_name: 'Pika 2.1 影视质感与物理动效',
    category: 'video',
    baseCredits: 30,
    channels: [
      { provider_id: 'muapi', provider_model_id: 'pika-2.1', base_cost: 0.06, is_primary: true }
    ]
  },
  {
    id: 'pika-2.0',
    name: 'Pika 2.0',
    display_name: 'Pika 2.0 动效视频生成',
    category: 'video',
    baseCredits: 28,
    channels: [
      { provider_id: 'muapi', provider_model_id: 'pika-2.0', base_cost: 0.05, is_primary: true }
    ]
  },
  {
    id: 'ideogram-v3',
    name: 'Ideogram v3',
    display_name: 'Ideogram v3 艺术排版与文本渲染',
    category: 'image',
    baseCredits: 16,
    channels: [
      { provider_id: 'muapi', provider_model_id: 'ideogram-v3', base_cost: 0.04, is_primary: true }
    ]
  },
  {
    id: 'recraft-v3',
    name: 'Recraft v3',
    display_name: 'Recraft v3 矢量商业插画与品牌设计',
    category: 'image',
    baseCredits: 16,
    channels: [
      { provider_id: 'muapi', provider_model_id: 'recraft-v3', base_cost: 0.04, is_primary: true }
    ]
  }
];

async function upsertChannel(tx, { model_id, provider_id, provider_model_id, base_cost, canonical_parent, is_primary, priority = 100 }) {
  const existing = await tx.queryOne(
    'SELECT id, metadata FROM ai_studio.provider_models WHERE model_id = $1 AND provider_id = $2 AND provider_model_id = $3',
    [model_id, provider_id, provider_model_id]
  );
  if (existing) {
    const meta = { ...(existing.metadata || {}), ...(canonical_parent ? { canonical_parent } : {}), primary: Boolean(is_primary) };
    await tx.execute(`
      UPDATE ai_studio.provider_models
      SET enabled = true,
          priority = $1,
          cost_config = jsonb_build_object('base_cost', $2::numeric, 'currency', 'USD'),
          review_status = 'approved',
          metadata = $3::jsonb,
          updated_at = now()
      WHERE id = $4
    `, [priority, base_cost, JSON.stringify(meta), existing.id]);
    return existing.id;
  } else {
    const newId = `pm_${model_id.replace(/[-.]/g, '_')}_${provider_id}_${Math.random().toString(36).substring(2, 7)}`;
    const meta = { ...(canonical_parent ? { canonical_parent } : {}), primary: Boolean(is_primary) };
    await tx.execute(`
      INSERT INTO ai_studio.provider_models
        (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config, review_status, metadata, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, true, $5, jsonb_build_object('base_cost', $6::numeric, 'currency', 'USD'), 'approved',
         $7::jsonb, now(), now())
    `, [newId, model_id, provider_id, provider_model_id, priority, base_cost, JSON.stringify(meta)]);
    return newId;
  }
}

export async function runReorganizeAndActivateAll() {
  console.log('================================================================');
  console.log('🚀 开始全量模型重新整理、上架与规范去重渠道配置...');
  console.log('================================================================');

  let reactivatedCount = 0;
  let restoredChannelsCount = 0;
  let createdNewModelsCount = 0;
  let updatedPricingCount = 0;

  await withTransaction(async (tx) => {
    // -------------------------------------------------------------
    // 步骤 1：处理核心家族与子变体模型的激活、渠道补齐与映射
    // -------------------------------------------------------------
    for (const group of CANONICAL_FAMILY_MAP) {
      const { targetId, name, category, display_name, preferredProvider, baseCredits, variants } = group;

      // 1.1 确保规范核心模型存在且 active
      await tx.execute(`
        INSERT INTO ai_studio.ai_models
          (id, slug, name, display_name, category, description, status, sort, is_featured, created_at, updated_at)
        VALUES ($1, $1, $2, $3, $4, $5, 'active', 5, true, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          status = 'active',
          name = EXCLUDED.name,
          display_name = EXCLUDED.display_name,
          category = EXCLUDED.category,
          sort = 5,
          updated_at = now()
      `, [targetId, name, display_name, category, `${display_name} - 规范聚合模型`]);

      // 确保核心模型的 model_pricing
      await tx.execute(`
        INSERT INTO ai_studio.model_pricing
          (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
        VALUES ($1, $2, 'fixed', $3, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          base_credits = EXCLUDED.base_credits,
          is_active = true,
          updated_at = now()
      `, [`prc_${targetId.replace(/[-.]/g, '_')}`, targetId, baseCredits || 25]);

      // 确保核心模型的 routing_policies
      await tx.execute(`
        INSERT INTO ai_studio.routing_policies
          (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
        VALUES ($1, $2, 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb,
                '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET failover_enabled = true, updated_at = now()
      `, [`rp_${targetId.replace(/[-.]/g, '_')}`, targetId]);

      // 获取当前核心模型的主选渠道供应商
      const targetChannels = await tx.queryMany(
        'SELECT id, provider_id, metadata FROM ai_studio.provider_models WHERE model_id = $1',
        [targetId]
      );
      let targetPrimaryProvider = preferredProvider;
      const targetPrimaryCh = targetChannels.find((c) => c.metadata && (c.metadata.primary === true || c.metadata.primary === 'true'));
      if (targetPrimaryCh) {
        targetPrimaryProvider = targetPrimaryCh.provider_id;
      }

      // 1.2 激活并还原各个变体模型 (Variants)
      for (const v of variants) {
        const variantId = v.id;
        // 激活变体模型
        await tx.execute(`
          INSERT INTO ai_studio.ai_models
            (id, slug, name, display_name, category, description, status, sort, is_featured, created_at, updated_at)
          VALUES ($1, $1, $2, $2, $3, $4, 'active', 50, false, now(), now())
          ON CONFLICT (id) DO UPDATE SET
            status = 'active',
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            description = $4,
            updated_at = now()
        `, [variantId, v.name, v.category || category, `${v.name} (归属于 ${display_name})`]);
        reactivatedCount++;

        // 确保变体模型的 model_pricing
        await tx.execute(`
          INSERT INTO ai_studio.model_pricing
            (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
          VALUES ($1, $2, 'fixed', $3, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now())
          ON CONFLICT (model_id) DO UPDATE SET
            base_credits = EXCLUDED.base_credits,
            is_active = true,
            updated_at = now()
        `, [`prc_${variantId.replace(/[-.]/g, '_')}`, variantId, v.baseCredits || baseCredits || 25]);
        updatedPricingCount++;

        // 确保变体模型的 routing_policies
        await tx.execute(`
          INSERT INTO ai_studio.routing_policies
            (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
          VALUES ($1, $2, 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb,
                  '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
          ON CONFLICT (model_id) DO UPDATE SET failover_enabled = true, updated_at = now()
        `, [`rp_${variantId.replace(/[-.]/g, '_')}`, variantId]);

        // 1.3 为变体模型挂载渠道 (MuAPI 聚合渠道 + 官方直连渠道)
        // A: MuAPI 渠道
        const isMuapiPrimary = (targetPrimaryProvider === 'muapi');
        await upsertChannel(tx, {
          model_id: variantId,
          provider_id: 'muapi',
          provider_model_id: v.provider_model_id || variantId,
          base_cost: v.base_cost || 0.04,
          canonical_parent: String(targetId),
          is_primary: isMuapiPrimary,
          priority: 100,
        });
        restoredChannelsCount++;

        // B: 官方渠道 (若存在官方适配)
        if (preferredProvider && preferredProvider !== 'muapi' && v.official_provider_model_id) {
          const isOfficialPrimary = (targetPrimaryProvider === preferredProvider);
          await upsertChannel(tx, {
            model_id: variantId,
            provider_id: preferredProvider,
            provider_model_id: v.official_provider_model_id,
            base_cost: v.base_cost || 0.04,
            canonical_parent: String(targetId),
            is_primary: isOfficialPrimary,
            priority: 110,
          });
          restoredChannelsCount++;
        }
      }
    }

    // -------------------------------------------------------------
    // 步骤 2：上架补充缺失的市场主流模型 (DALL·E 3, Pika 2.0/2.1, Ideogram, Recraft)
    // -------------------------------------------------------------
    for (const m of ADDITIONAL_MAINSTREAM_MODELS) {
      await tx.execute(`
        INSERT INTO ai_studio.ai_models
          (id, slug, name, display_name, category, description, status, sort, is_featured, created_at, updated_at)
        VALUES ($1, $1, $2, $3, $4, $5, 'active', 8, true, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          status = 'active',
          display_name = EXCLUDED.display_name,
          updated_at = now()
      `, [m.id, m.name, m.display_name, m.category, `${m.display_name} - 市场主流深度适配`]);
      createdNewModelsCount++;

      // 定价
      await tx.execute(`
        INSERT INTO ai_studio.model_pricing
          (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
        VALUES ($1, $2, 'fixed', $3, '{}'::jsonb, '{}'::jsonb, 10, 0.7500, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          base_credits = EXCLUDED.base_credits,
          is_active = true,
          updated_at = now()
      `, [`prc_${m.id.replace(/[-.]/g, '_')}`, m.id, m.baseCredits || 20]);

      // 路由
      await tx.execute(`
        INSERT INTO ai_studio.routing_policies
          (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
        VALUES ($1, $2, 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb,
                '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET failover_enabled = true, updated_at = now()
      `, [`rp_${m.id.replace(/[-.]/g, '_')}`, m.id]);

      // 渠道
      for (const ch of m.channels) {
        await upsertChannel(tx, {
          model_id: m.id,
          provider_id: ch.provider_id,
          provider_model_id: ch.provider_model_id,
          base_cost: ch.base_cost,
          is_primary: Boolean(ch.is_primary),
          priority: 100,
        });
        restoredChannelsCount++;
      }
    }

    // -------------------------------------------------------------
    // 步骤 3：全库安全补全：确保所有剩余模型均处于 active 且拥有 pricing 与渠道
    // -------------------------------------------------------------
    console.log('检查并修复所有剩余模型的激活与定价状态...');
    // 将所有历史处于 disabled 的模型全部重新激活为 active
    await tx.execute(`
      UPDATE ai_studio.ai_models
      SET status = 'active', updated_at = now()
      WHERE status = 'disabled'
    `);

    // 确保每个活跃模型都有 model_pricing
    const unpriced = await tx.queryMany(`
      SELECT m.id, m.category FROM ai_studio.ai_models m
      WHERE NOT EXISTS (SELECT 1 FROM ai_studio.model_pricing p WHERE p.model_id = m.id AND p.is_active = true)
    `);
    for (const m of unpriced) {
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
      updatedPricingCount++;
    }

    // 确保每个活跃模型都有 routing_policies
    const unrouted = await tx.queryMany(`
      SELECT m.id FROM ai_studio.ai_models m
      WHERE NOT EXISTS (SELECT 1 FROM ai_studio.routing_policies rp WHERE rp.model_id = m.id)
    `);
    for (const m of unrouted) {
      await tx.execute(`
        INSERT INTO ai_studio.routing_policies
          (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
        VALUES
          ($1, $2, 'balanced', '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb,
           '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET failover_enabled = true, updated_at = now()
      `, [`rp_${m.id.replace(/[-.]/g, '_')}`, m.id]);
    }

    // 确保每个活跃模型至少有一个有成本的渠道
    const channelless = await tx.queryMany(`
      SELECT m.id, m.category FROM ai_studio.ai_models m
      WHERE NOT EXISTS (SELECT 1 FROM ai_studio.provider_models pm WHERE pm.model_id = m.id AND pm.enabled = true)
    `);
    for (const m of channelless) {
      let cost = 0.03;
      if (m.category === 'video') cost = 0.05;
      else if (m.category === 'image') cost = 0.02;
      else if (m.category === 'audio') cost = 0.015;

      await upsertChannel(tx, {
        model_id: m.id,
        provider_id: 'muapi',
        provider_model_id: m.id,
        base_cost: cost,
        is_primary: true,
        priority: 100,
      });
      restoredChannelsCount++;
    }
  });

  console.log('================================================================');
  console.log('✅ 全量模型重新整理与全部在架成功完成！');
  console.log(`- 重新激活模型数: ${reactivatedCount}`);
  console.log(`- 恢复/创建渠道数: ${restoredChannelsCount}`);
  console.log(`- 新增市场主流模型: ${createdNewModelsCount}`);
  console.log(`- 补齐/更新定价模型数: ${updatedPricingCount}`);
  console.log('================================================================');
}

// 独立执行
if (process.argv[1] && process.argv[1].endsWith('reorganize-and-activate-all-models.mjs')) {
  runReorganizeAndActivateAll()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error during model reorganization:', err);
      process.exit(1);
    });
}
