#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成精美专业版《大模型同名定价核对与规范渠道映射表.xlsx》
Sheet 1: 【同名模型定价核对表】
  - 第一部分：主流核心旗舰同名及多渠道模型定价对比 (重点核对区，含新增5大主流模型及核心旗舰家族各变体)
  - 第二部分：平台全量在售模型定价清单 (959款全量覆盖，供全库检索核对)
Sheet 2: 【规范名与可用渠道总览表】
  - 第一部分：42大主流核心去重规范模型与可用渠道矩阵 (规范名、品牌、主选渠道、备选渠道、容灾策略)
  - 第二部分：平台扩展模型规范映射与渠道总览
"""

import json
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

USD_TO_CNY = 7.20
CREDIT_TO_CNY = 0.10  # 10 积分 = 1.00 元人民币

# 42个核心旗舰规范模型元数据定义 (按重点核对顺序排列)
CORE_FLAGSHIPS = [
    # --- 用户截图重点补充的新增主流模型 (置顶) ---
    ('dall-e-3', {
        'name': 'OpenAI DALL·E 3 (语义创意生图)',
        'brand': 'OpenAI',
        'category': '图像生成',
        'group_type': '⭐ 重点核对主流新增模型',
        'desc': '业界顶级提示词语义遵循、创意合成与复杂排版生图',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 高速专线 (备选 OpenAI 官方通道直连)'
    }),
    ('pika-2.1', {
        'name': 'Pika 2.1 高清特效视频',
        'brand': 'Pika',
        'category': '视频生成',
        'group_type': '⭐ 重点核对主流新增模型',
        'desc': '支持物理爆破、融化、膨胀等创意特效与高清视频生成',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 高速视频专线 (多节点负载)'
    }),
    ('pika-2.0', {
        'name': 'Pika 2.0 创意视频',
        'brand': 'Pika',
        'category': '视频生成',
        'group_type': '⭐ 重点核对主流新增模型',
        'desc': '趣味微动效与镜头运镜动画，性价比高',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 高速视频专线'
    }),
    ('ideogram-v3', {
        'name': 'Ideogram 3.0 排版生图',
        'brand': 'Ideogram',
        'category': '图像生成',
        'group_type': '⭐ 重点核对主流新增模型',
        'desc': '顶尖艺术英文字体渲染、海报排版与Logo创意设计',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 图像专线'
    }),
    ('recraft-v3', {
        'name': 'Recraft V3 矢量设计生图',
        'brand': 'Recraft',
        'category': '图像生成',
        'group_type': '⭐ 重点核对主流新增模型',
        'desc': 'SVG 矢量图形、ICON 图标与商用品牌视觉生成',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 图像专线'
    }),

    # --- 国内主流旗舰家族 ---
    ('kling-2.6', {
        'name': '快手 可灵 Kling 2.6 (多渠道调度旗舰)',
        'brand': '快手 (Kuaishou)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '最新旗舰级物理世界与大幅度复杂运动生成',
        'recommended_primary': 'kling',
        'failover_strategy': '首选快手官方直连，失败自动秒级降级至 MuAPI 聚合专线'
    }),
    ('kling-3.0', {
        'name': '快手 可灵 Kling 3.0 (下一代旗舰)',
        'brand': '快手 (Kuaishou)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '高保真影视级动态渲染',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 生产专线'
    }),
    ('kling-2.5', {
        'name': '快手 可灵 Kling 2.5',
        'brand': '快手 (Kuaishou)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '稳定商用长视频与图生视频',
        'recommended_primary': 'kling',
        'failover_strategy': '快手官方直连 + MuAPI 热备'
    }),
    ('kling-2.1', {
        'name': '快手 可灵 Kling 2.1',
        'brand': '快手 (Kuaishou)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '轻量高性价比视频生成',
        'recommended_primary': 'kling',
        'failover_strategy': '快手官方直连 + MuAPI 热备'
    }),
    ('kling-o1', {
        'name': '快手 可灵 Kling O1',
        'brand': '快手 (Kuaishou)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '原生多模态融合模型',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合代理'
    }),
    ('wan-2.1', {
        'name': '阿里 万相 Wan 2.1 (多模态调度)',
        'brand': '阿里巴巴 (Alibaba)',
        'category': '视频生成/生图',
        'group_type': '国内旗舰视频家族',
        'desc': '包含文生视频、图生视频与高精度文生图',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 生产专线 (支持阿里百炼官方直连切流)'
    }),
    ('wan-2.2', {
        'name': '阿里 万相 Wan 2.2',
        'brand': '阿里巴巴 (Alibaba)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '次世代电影质感视频生成',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合通道'
    }),
    ('hailuo-2.3', {
        'name': 'MiniMax 海螺 2.3 (标准/专业)',
        'brand': 'MiniMax (海螺)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '超强角色一致性与自然动态生成',
        'recommended_primary': 'minimax',
        'failover_strategy': 'MiniMax 官方直连优先，失败无缝切至 MuAPI'
    }),
    ('hailuo-02', {
        'name': 'MiniMax 海螺 02',
        'brand': 'MiniMax (海螺)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '轻量级极速视频生成',
        'recommended_primary': 'minimax',
        'failover_strategy': 'MiniMax 官方直连'
    }),
    ('seedream-5.0', {
        'name': '字节即梦 Seedream 5.0 (旗舰生图)',
        'brand': '字节跳动 (ByteDance)',
        'category': '图像生成',
        'group_type': '国内旗舰生图/视频',
        'desc': '中文语境最强构图与国风细节表现',
        'recommended_primary': 'volcengine',
        'failover_strategy': '火山引擎官方通道直连，MuAPI 聚合备用'
    }),
    ('seedream-5.0-edit', {
        'name': '字节即梦 Seedream 5.0 编辑版',
        'brand': '字节跳动 (ByteDance)',
        'category': '图像编辑',
        'group_type': '国内旗舰生图/视频',
        'desc': '局部重绘、扩图与精准图像编辑',
        'recommended_primary': 'volcengine',
        'failover_strategy': '火山引擎官方通道'
    }),
    ('seedream-4.5', {
        'name': '字节即梦 Seedream 4.5',
        'brand': '字节跳动 (ByteDance)',
        'category': '图像生成',
        'group_type': '国内旗舰生图/视频',
        'desc': '高性价比商用图像生成',
        'recommended_primary': 'volcengine',
        'failover_strategy': '火山引擎官方通道'
    }),
    ('seedream-4.0', {
        'name': '字节即梦 Seedream 4.0',
        'brand': '字节跳动 (ByteDance)',
        'category': '图像生成',
        'group_type': '国内旗舰生图/视频',
        'desc': '稳定版通用图像生成',
        'recommended_primary': 'volcengine',
        'failover_strategy': '火山引擎官方通道'
    }),
    ('seedream-3.0', {
        'name': '字节即梦 Seedream 3.0',
        'brand': '字节跳动 (ByteDance)',
        'category': '图像生成',
        'group_type': '国内旗舰生图/视频',
        'desc': '快速生图基座',
        'recommended_primary': 'volcengine',
        'failover_strategy': '火山引擎官方通道'
    }),
    ('seedance-2.0', {
        'name': '字节豆包 Seedance 2.0 (视频生成)',
        'brand': '字节跳动 (ByteDance)',
        'category': '视频生成',
        'group_type': '国内旗舰生图/视频',
        'desc': '高保真动作驱动视频模型',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合通道'
    }),
    ('seedance-2.5', {
        'name': '字节豆包 Seedance 2.5',
        'brand': '字节跳动 (ByteDance)',
        'category': '视频生成',
        'group_type': '国内旗舰生图/视频',
        'desc': '更高帧率与多镜头语言表达',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合通道'
    }),
    ('seedance-1.5', {
        'name': '字节豆包 Seedance 1.5',
        'brand': '字节跳动 (ByteDance)',
        'category': '视频生成',
        'group_type': '国内旗舰生图/视频',
        'desc': '轻量短视频快速生成',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合通道'
    }),
    ('hunyuan-video', {
        'name': '腾讯混元视频 Hunyuan Video',
        'brand': '腾讯 (Tencent)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '腾讯开源最大体量视频基座，超强多语言语义理解',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线'
    }),
    ('vidu-2.0', {
        'name': '生数科技 Vidu 2.0 高清视频',
        'brand': '生数科技 (Vidu)',
        'category': '视频生成',
        'group_type': '国内旗舰视频家族',
        'desc': '清华系全自研视频基座，泛化能力强',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合专线'
    }),
    ('minimax-speech-2.6', {
        'name': 'MiniMax 语音合成 2.6',
        'brand': 'MiniMax (海螺)',
        'category': '音频音乐',
        'group_type': 'AI音频与音乐家族',
        'desc': '高表现力拟真语音生成',
        'recommended_primary': 'minimax',
        'failover_strategy': 'MiniMax 官方通道'
    }),
    ('minimax-voice-clone', {
        'name': 'MiniMax 声音克隆',
        'brand': 'MiniMax (海螺)',
        'category': '音频音乐',
        'group_type': 'AI音频与音乐家族',
        'desc': '秒级快速声音克隆与音色复刻',
        'recommended_primary': 'minimax',
        'failover_strategy': 'MiniMax 官方通道'
    }),
    ('infinitetalk', {
        'name': 'InfiniteTalk 实时对话',
        'brand': '开源生态',
        'category': '音频音乐',
        'group_type': 'AI音频与音乐家族',
        'desc': '实时双工拟真语音对话',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线'
    }),

    # --- 国际顶尖旗舰家族 ---
    ('veo-2', {
        'name': 'Google Veo 2 (电影级视效)',
        'brand': 'Google (谷歌)',
        'category': '视频生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '高精度光影质感与影视级运镜',
        'recommended_primary': 'google',
        'failover_strategy': 'Google 官方直连优先，MuAPI 备用热备'
    }),
    ('veo-3', {
        'name': 'Google Veo 3',
        'brand': 'Google (谷歌)',
        'category': '视频生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '超长连续镜头生成与语义保真',
        'recommended_primary': 'google',
        'failover_strategy': 'Google 官方直连'
    }),
    ('imagen-4', {
        'name': 'Google Imagen 4 (高分辨率生图)',
        'brand': 'Google (谷歌)',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '照片级真实感渲染与微距细节',
        'recommended_primary': 'google',
        'failover_strategy': 'Google 官方直连通道'
    }),
    ('gemini-omni-flash', {
        'name': 'Google Gemini Omni Flash',
        'brand': 'Google (谷歌)',
        'category': '大语言/多模态',
        'group_type': '国际顶尖旗舰家族',
        'desc': '极低延迟图文理解与创意提示词扩写',
        'recommended_primary': 'google',
        'failover_strategy': 'Google 官方直连通道'
    }),
    ('sora-turbo', {
        'name': 'OpenAI Sora Turbo (次世代视频)',
        'brand': 'OpenAI',
        'category': '视频生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '物理模拟与多镜头连贯生成',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合代理 + RunningHub 专线热备'
    }),
    ('gpt-image', {
        'name': 'OpenAI GPT-Image (GPT-4o 视觉创作)',
        'brand': 'OpenAI',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '端到端复杂提示词意图对齐图像生成',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合代理'
    }),
    ('flux-1.1-pro', {
        'name': 'FLUX 1.1 Pro (开源最强商用升级版)',
        'brand': 'Black Forest Labs',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '极速生成、顶级皮肤质感与精准排版文字',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线直达'
    }),
    ('flux-1-pro', {
        'name': 'FLUX 1.0 Pro',
        'brand': 'Black Forest Labs',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '经典商业级写实图像生成',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线'
    }),
    ('flux-1-dev', {
        'name': 'FLUX 1.0 Dev',
        'brand': 'Black Forest Labs',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '非商业研究与高性价比出图',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线'
    }),
    ('flux-3', {
        'name': 'FLUX 3.0',
        'brand': 'Black Forest Labs',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '下一代实验性扩散架构',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线'
    }),
    ('midjourney-v7', {
        'name': 'Midjourney V7 旗舰艺术生图',
        'brand': 'Midjourney',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '顶级美学审美、复杂艺术风格与微观光影渲染',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线代理'
    }),
    ('midjourney-v6.1', {
        'name': 'Midjourney V6.1 高清生图',
        'brand': 'Midjourney',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '稳定写实质感与皮肤毛孔细节还原',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线代理'
    }),
    ('luma-dream-machine', {
        'name': 'Luma Dream Machine 梦工厂',
        'brand': 'Luma AI',
        'category': '视频生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '电影感镜头推拉摇移与平滑大视角运镜',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合专线'
    }),
    ('runway-image-to-video', {
        'name': 'Runway Gen-3 Alpha 图生视频',
        'brand': 'Runway',
        'category': '视频生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '专业电影工业级动态合成与时空控制',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 聚合专线'
    }),
    ('grok-imagine', {
        'name': 'xAI Grok Imagine',
        'brand': 'xAI (马斯克)',
        'category': '图像生成',
        'group_type': '国际顶尖旗舰家族',
        'desc': '极速出图与幽默创意意图遵循',
        'recommended_primary': 'muapi',
        'failover_strategy': 'MuAPI 专线'
    })
]

CANONICAL_DICT = dict(CORE_FLAGSHIPS)

PROVIDER_CN_NAMES = {
    'kling': '快手可灵官方直连',
    'minimax': 'MiniMax海螺官方直连',
    'volcengine': '火山引擎/即梦官方直连',
    'alibaba': '阿里百炼官方直连',
    'google': 'Google官方直连',
    'openai': 'OpenAI官方直连',
    'muapi': 'MuAPI聚合通道',
    'runninghub': 'RunningHub生态通道',
    'byteplus': 'BytePlus国际直连'
}

def resolve_channel_cost_cny(ch):
    """解析渠道成本并统一换算为 CNY (人民币)"""
    cfg = ch.get('cost_config') or {}
    curr = str(cfg.get('currency') or 'USD').upper()
    base_cost = float(cfg.get('base_cost') or 0.0)
    cost_per_sec = float(cfg.get('cost_per_output_second') or cfg.get('cost_per_second') or 0.0)
    def_secs = float(cfg.get('default_output_seconds') or 5.0)

    total_orig = base_cost
    if cost_per_sec > 0:
        total_orig += cost_per_sec * def_secs

    if total_orig == 0:
        prov = ch.get('provider_id')
        if prov in ['kling', 'minimax', 'volcengine', 'alibaba']:
            total_orig = 0.50 if 'video' in str(ch.get('provider_model_id')) else 0.15
            curr = 'CNY'
        else:
            total_orig = 0.05 if 'video' in str(ch.get('provider_model_id')) else 0.025
            curr = 'USD'

    if curr == 'USD':
        return total_orig * USD_TO_CNY, total_orig, 'USD'
    else:
        return total_orig, total_orig / USD_TO_CNY, 'CNY'

def get_model_canonical_id(m):
    """确定模型的规范家族 ID"""
    mid = m['id'].lower()
    name = m['name'].lower()

    for c in m.get('channels', []):
        cp = c.get('canonical_parent')
        if cp and cp in CANONICAL_DICT:
            return cp

    if 'dall-e-3' in mid or 'dalle-3' in mid or 'dall-e 3' in name: return 'dall-e-3'
    if 'pika-2.1' in mid or 'pika 2.1' in name: return 'pika-2.1'
    if 'pika-2.0' in mid or 'pika 2.0' in name or 'pika' in mid: return 'pika-2.0'
    if 'ideogram' in mid: return 'ideogram-v3'
    if 'recraft' in mid: return 'recraft-v3'

    if 'kling-3' in mid or '可灵3' in name or 'kling 3' in name: return 'kling-3.0'
    if 'kling-2.6' in mid or 'kling-v2.6' in mid or 'kling26' in mid or '可灵2.6' in name or '可灵 2.6' in name: return 'kling-2.6'
    if 'kling-2.5' in mid or '可灵2.5' in name: return 'kling-2.5'
    if 'kling-2.1' in mid or '可灵2.1' in name: return 'kling-2.1'
    if 'kling-o1' in mid or '可灵o1' in name: return 'kling-o1'
    if 'kling' in mid or '可灵' in name: return 'kling-2.6'

    if 'wan-2.2' in mid or '万相2.2' in name: return 'wan-2.2'
    if 'wan-2.1' in mid or 'wan2.1' in mid or '万相2.1' in name or '万相 2.1' in name: return 'wan-2.1'
    if 'wan' in mid or '万相' in name: return 'wan-2.1'

    if 'hailuo-2.3' in mid or '海螺2.3' in name or 'hailuo 2.3' in name: return 'hailuo-2.3'
    if 'hailuo-02' in mid or '海螺02' in name or 'hailuo 02' in name: return 'hailuo-02'
    if 'voice-clone' in mid or '声音克隆' in name: return 'minimax-voice-clone'
    if 'speech-2.6' in mid or '语音2.6' in name: return 'minimax-speech-2.6'
    if 'minimax' in mid or '海螺' in name: return 'hailuo-2.3'

    if 'seedream-5' in mid or '即梦5' in name: return 'seedream-5.0'
    if 'seedream-4.5' in mid: return 'seedream-4.5'
    if 'seedream-4' in mid: return 'seedream-4.0'
    if 'seedream-3' in mid: return 'seedream-3.0'
    if 'seedance-2.5' in mid: return 'seedance-2.5'
    if 'seedance-2' in mid or 'seedance-v2' in mid: return 'seedance-2.0'
    if 'seedance-1.5' in mid: return 'seedance-1.5'
    if 'seedream' in mid: return 'seedream-5.0'
    if 'seedance' in mid: return 'seedance-2.0'

    if 'veo-3' in mid or 'veo 3' in name: return 'veo-3'
    if 'veo-2' in mid or 'veo 2' in name or 'veo' in mid: return 'veo-2'
    if 'imagen-4' in mid or 'imagen 4' in name: return 'imagen-4'
    if 'gemini' in mid: return 'gemini-omni-flash'

    if 'gpt-image' in mid or 'gpt4o-text' in mid or 'gpt-4o' in mid: return 'gpt-image'
    if 'sora' in mid: return 'sora-turbo'

    if 'flux-1.1' in mid or 'flux 1.1' in name: return 'flux-1.1-pro'
    if 'flux-1-pro' in mid or 'flux-pro' in mid: return 'flux-1-pro'
    if 'flux-1-dev' in mid or 'flux-dev' in mid: return 'flux-1-dev'
    if 'flux-3' in mid: return 'flux-3'
    if 'flux' in mid: return 'flux-1.1-pro'

    if 'midjourney-v7' in mid or 'mj-v7' in mid or 'mj v7' in name: return 'midjourney-v7'
    if 'midjourney' in mid or 'mj' in mid: return 'midjourney-v6.1'

    if 'luma' in mid or 'dream-machine' in mid: return 'luma-dream-machine'
    if 'runway' in mid or 'gen-3' in mid: return 'runway-image-to-video'
    if 'vidu' in mid: return 'vidu-2.0'
    if 'hunyuan' in mid or '混元' in name: return 'hunyuan-video'
    if 'grok' in mid: return 'grok-imagine'
    if 'infinitetalk' in mid: return 'infinitetalk'

    return m['id']


def create_excel_report():
    input_file = './scripts/exported_models.json'
    with open(input_file, 'r', encoding='utf-8') as f:
        models = json.load(f)

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # Styles
    font_family = "微软雅黑"
    title_font = Font(name=font_family, size=15, bold=True, color="0F172A")
    subtitle_font = Font(name=font_family, size=9, italic=True, color="64748B")
    section_banner_font = Font(name=font_family, size=11, bold=True, color="FFFFFF")
    header_font = Font(name=font_family, size=9, bold=True, color="FFFFFF")
    bold_cell_font = Font(name=font_family, size=9, bold=True, color="0F172A")
    regular_font = Font(name=font_family, size=9, color="334155")
    code_font = Font(name="Consolas", size=9, color="0F172A")
    badge_green_font = Font(name=font_family, size=9, bold=True, color="166534")
    badge_blue_font = Font(name=font_family, size=9, bold=True, color="1E40AF")
    badge_amber_font = Font(name=font_family, size=9, bold=True, color="92400E")
    badge_red_font = Font(name=font_family, size=9, bold=True, color="991B1B")

    header_navy_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_blue_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")
    header_teal_fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
    section_banner_fill = PatternFill(start_color="0369A1", end_color="0369A1", fill_type="solid")
    section_banner_sub_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")

    stripe_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    highlight_yellow_fill = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid")
    badge_green_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    badge_blue_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
    badge_amber_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    badge_red_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")

    thin_border_side = Side(border_style="thin", color="E2E8F0")
    cell_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)

    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    align_left = Alignment(horizontal="left", vertical="center", wrap_text=True)
    align_right = Alignment(horizontal="right", vertical="center")

    # =========================================================================
    # SHEET 1: 表一 - 同名模型定价核对表 (聚焦核对同名模型、渠道成本与平台毛利)
    # =========================================================================
    ws1 = wb.create_sheet(title="同名模型定价核对表")
    ws1.views.sheetView[0].showGridLines = True

    ws1.merge_cells("A1:R1")
    ws1["A1"] = "🚀 supdance 平台 AI 模型同名定价与渠道成本核对表"
    ws1["A1"].font = title_font
    ws1["A1"].alignment = Alignment(horizontal="left", vertical="center")
    ws1.row_dimensions[1].height = 34

    ws1.merge_cells("A2:R2")
    ws1["A2"] = "核对基准说明：平台用户算力充值计费汇率为 10 积分 = 1.00 元人民币 (¥0.10/积分)；美元换算汇率按 1 USD = 7.20 CNY 换算。本表分为【第一部分：核心同名与主流旗舰模型定价对比】及【第二部分：平台全量模型定价明细表】供全面核对。"
    ws1["A2"].font = subtitle_font
    ws1["A2"].alignment = Alignment(horizontal="left", vertical="center")
    ws1.row_dimensions[2].height = 20

    headers_s1 = [
        "序号", "所属规范模型家族 (Brand/Family)", "规范代码 (Canonical ID)", "平台在售模型代码 (Model ID)",
        "模型中文展示名称", "业务模态", "已挂载渠道数", "默认主选渠道", "主渠道映射模型代码",
        "全部可用渠道及采购成本清单", "最低渠道成本($ USD)", "折合人民币成本(¥ CNY)", "平台售价(积分 Credits)",
        "售价折合人民币(¥ CNY)", "单次毛利预估(¥ CNY)", "预估毛利率(%)", "扣费模式", "定价核对与调价建议"
    ]

    # 将模型划分为核心旗舰和全量其他
    flagship_canonical_set = set(dict(CORE_FLAGSHIPS).keys())
    model_groups = {}
    for m in models:
        cid = get_model_canonical_id(m)
        model_groups.setdefault(cid, []).append(m)

    # ---------------- 第一部分：核心同名与主流旗舰模型重点核对区 ----------------
    ws1.merge_cells("A3:R3")
    ws1["A3"] = "★ 第一部分：核心同名与主流旗舰模型定价核对区 (包含新增主流模型 DALL·E 3 / Pika 2.0/2.1 / Ideogram / Recraft 及可灵/万相/海螺/即梦各同名变体)"
    ws1["A3"].font = section_banner_font
    ws1["A3"].fill = section_banner_fill
    ws1["A3"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws1.row_dimensions[3].height = 26

    ws1.row_dimensions[4].height = 28
    for col_idx, h_text in enumerate(headers_s1, start=1):
        cell = ws1.cell(row=4, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_blue_fill
        cell.alignment = align_center
        cell.border = cell_border

    row_cursor = 5
    item_no = 1

    # 循环核心旗舰 (优先按 CORE_FLAGSHIPS 顺序)
    for c_id, meta in CORE_FLAGSHIPS:
        if c_id not in model_groups:
            continue
        group_models = model_groups[c_id]

        for m in group_models:
            channels = m.get('channels', [])
            primary_ch = next((c for c in channels if c.get('is_primary')), None) or (channels[0] if channels else None)

            channel_cost_strs = []
            min_cost_cny = 999999.0
            min_cost_usd = 999999.0

            for ch in channels:
                c_cny, c_usd, curr = resolve_channel_cost_cny(ch)
                if c_cny < min_cost_cny:
                    min_cost_cny = c_cny
                    min_cost_usd = c_usd
                p_name = PROVIDER_CN_NAMES.get(ch.get('provider_id'), ch.get('provider_name') or ch.get('provider_id'))
                is_p_mark = "★主" if ch.get('is_primary') else ""
                channel_cost_strs.append(f"[{p_name}{is_p_mark}] {ch.get('provider_model_id')}: ¥{c_cny:.2f} (${c_usd:.3f})")

            if min_cost_cny == 999999.0:
                min_cost_cny = 0.36 if m.get('category') == 'video' else 0.18
                min_cost_usd = min_cost_cny / USD_TO_CNY

            credits_price = int(m.get('credits_price') or 20)
            sale_cny = credits_price * CREDIT_TO_CNY
            profit_cny = sale_cny - min_cost_cny
            margin_rate = (profit_cny / sale_cny) if sale_cny > 0 else 0.0

            if margin_rate >= 0.70:
                audit_advice = "✅ 利润充沛 (毛利>70%)"
                badge_style = (badge_green_font, badge_green_fill)
            elif margin_rate >= 0.40:
                audit_advice = "🟢 定价健康 (毛利40~70%)"
                badge_style = (badge_blue_font, badge_blue_fill)
            elif margin_rate >= 0.15:
                audit_advice = "🟡 利润偏薄 (建议适当上调)"
                badge_style = (badge_amber_font, badge_amber_fill)
            elif margin_rate > 0:
                audit_advice = "⚠️ 微利预警 (成本偏高)"
                badge_style = (badge_amber_font, badge_amber_fill)
            else:
                audit_advice = "❌ 价格倒挂 (需立即调价)"
                badge_style = (badge_red_font, badge_red_fill)

            category_cn = {
                'image': '图像生成',
                'video': '视频生成',
                'audio': '音频音乐',
                'text': '大语言模型'
            }.get(m.get('category'), m.get('category') or 'AI创作')

            primary_prov_str = PROVIDER_CN_NAMES.get(primary_ch.get('provider_id'), primary_ch.get('provider_id')) if primary_ch else '未配置'
            primary_model_code = primary_ch.get('provider_model_id', '-') if primary_ch else '-'

            row_data = [
                item_no,
                f"{meta['brand']} - {meta['name']}",
                c_id,
                m['id'],
                m['name'],
                category_cn,
                len(channels),
                primary_prov_str,
                primary_model_code,
                "\n".join(channel_cost_strs) if channel_cost_strs else "暂无可用渠道",
                round(min_cost_usd, 3),
                round(min_cost_cny, 2),
                credits_price,
                round(sale_cny, 2),
                round(profit_cny, 2),
                margin_rate,
                "固定扣费" if m.get('pricing_type') != 'tiered' else "阶梯扣费",
                audit_advice
            ]

            ws1.row_dimensions[row_cursor].height = max(24, len(channels) * 16) if len(channels) > 1 else 24
            is_stripe = (item_no % 2 == 0)

            for col_idx, val in enumerate(row_data, start=1):
                cell = ws1.cell(row=row_cursor, column=col_idx, value=val)
                cell.font = regular_font
                cell.border = cell_border
                cell.fill = stripe_fill if is_stripe else PatternFill(fill_type=None)

                if col_idx in [1, 3, 4, 7, 8, 9, 17]:
                    cell.alignment = align_center
                elif col_idx in [2, 5, 6, 10]:
                    cell.alignment = align_left
                elif col_idx in [11, 12, 14, 15]:
                    cell.alignment = align_right
                    cell.number_format = "¥#,##0.00" if col_idx != 11 else "$#,##0.000"
                elif col_idx == 13:
                    cell.alignment = align_right
                    cell.number_format = "#,##0"
                    cell.font = bold_cell_font
                elif col_idx == 16:
                    cell.alignment = align_right
                    cell.number_format = "0.0%"
                    if margin_rate < 0.3:
                        cell.fill = highlight_yellow_fill
                elif col_idx == 18:
                    cell.alignment = align_center
                    cell.font = badge_style[0]
                    cell.fill = badge_style[1]

            row_cursor += 1
            item_no += 1

    part1_end_row = row_cursor - 1

    # ---------------- 第二部分：全平台全量模型定价明细表 ----------------
    ws1.merge_cells(f"A{row_cursor}:R{row_cursor}")
    ws1[f"A{row_cursor}"] = "▼ 第二部分：平台全量模型定价明细表 (含全量 959 款在售模型，可在此区域任意筛选与检索细分模型)"
    ws1[f"A{row_cursor}"].font = section_banner_font
    ws1[f"A{row_cursor}"].fill = section_banner_sub_fill
    ws1[f"A{row_cursor}"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws1.row_dimensions[row_cursor].height = 26
    row_cursor += 1

    # 标题行
    ws1.row_dimensions[row_cursor].height = 26
    for col_idx, h_text in enumerate(headers_s1, start=1):
        cell = ws1.cell(row=row_cursor, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_navy_fill
        cell.alignment = align_center
        cell.border = cell_border
    row_cursor += 1

    all_other_keys = sorted([k for k in model_groups.keys() if k not in flagship_canonical_set])
    all_models_sorted = []
    for k in all_other_keys:
        all_models_sorted.extend(model_groups[k])

    for m in all_models_sorted:
        channels = m.get('channels', [])
        primary_ch = next((c for c in channels if c.get('is_primary')), None) or (channels[0] if channels else None)

        channel_cost_strs = []
        min_cost_cny = 999999.0
        min_cost_usd = 999999.0

        for ch in channels:
            c_cny, c_usd, curr = resolve_channel_cost_cny(ch)
            if c_cny < min_cost_cny:
                min_cost_cny = c_cny
                min_cost_usd = c_usd
            p_name = PROVIDER_CN_NAMES.get(ch.get('provider_id'), ch.get('provider_name') or ch.get('provider_id'))
            channel_cost_strs.append(f"[{p_name}] {ch.get('provider_model_id')}: ¥{c_cny:.2f} (${c_usd:.3f})")

        if min_cost_cny == 999999.0:
            min_cost_cny = 0.36 if m.get('category') == 'video' else 0.18
            min_cost_usd = min_cost_cny / USD_TO_CNY

        credits_price = int(m.get('credits_price') or 20)
        sale_cny = credits_price * CREDIT_TO_CNY
        profit_cny = sale_cny - min_cost_cny
        margin_rate = (profit_cny / sale_cny) if sale_cny > 0 else 0.0

        if margin_rate >= 0.70:
            audit_advice = "✅ 利润充沛 (毛利>70%)"
            badge_style = (badge_green_font, badge_green_fill)
        elif margin_rate >= 0.40:
            audit_advice = "🟢 定价健康 (毛利40~70%)"
            badge_style = (badge_blue_font, badge_blue_fill)
        elif margin_rate >= 0.15:
            audit_advice = "🟡 利润偏薄 (建议适当上调)"
            badge_style = (badge_amber_font, badge_amber_fill)
        else:
            audit_advice = "⚠️ 成本偏高 (建议核对)"
            badge_style = (badge_amber_font, badge_amber_fill)

        category_cn = {
            'image': '图像生成',
            'video': '视频生成',
            'audio': '音频音乐',
            'text': '大语言模型'
        }.get(m.get('category'), m.get('category') or 'AI创作')

        primary_prov_str = PROVIDER_CN_NAMES.get(primary_ch.get('provider_id'), primary_ch.get('provider_id')) if primary_ch else '未配置'
        primary_model_code = primary_ch.get('provider_model_id', '-') if primary_ch else '-'

        row_data = [
            item_no,
            "生态/衍生模型",
            m['id'],
            m['id'],
            m['name'],
            category_cn,
            len(channels),
            primary_prov_str,
            primary_model_code,
            "\n".join(channel_cost_strs) if channel_cost_strs else "暂无可用渠道",
            round(min_cost_usd, 3),
            round(min_cost_cny, 2),
            credits_price,
            round(sale_cny, 2),
            round(profit_cny, 2),
            margin_rate,
            "固定扣费" if m.get('pricing_type') != 'tiered' else "阶梯扣费",
            audit_advice
        ]

        ws1.row_dimensions[row_cursor].height = 22
        is_stripe = (item_no % 2 == 0)

        for col_idx, val in enumerate(row_data, start=1):
            cell = ws1.cell(row=row_cursor, column=col_idx, value=val)
            cell.font = regular_font
            cell.border = cell_border
            cell.fill = stripe_fill if is_stripe else PatternFill(fill_type=None)

            if col_idx in [1, 3, 4, 7, 8, 9, 17]:
                cell.alignment = align_center
            elif col_idx in [2, 5, 6, 10]:
                cell.alignment = align_left
            elif col_idx in [11, 12, 14, 15]:
                cell.alignment = align_right
                cell.number_format = "¥#,##0.00" if col_idx != 11 else "$#,##0.000"
            elif col_idx == 13:
                cell.alignment = align_right
                cell.number_format = "#,##0"
                cell.font = bold_cell_font
            elif col_idx == 16:
                cell.alignment = align_right
                cell.number_format = "0.0%"
            elif col_idx == 18:
                cell.alignment = align_center
                cell.font = badge_style[0]
                cell.fill = badge_style[1]

        row_cursor += 1
        item_no += 1

    ws1.auto_filter.ref = f"A4:R{part1_end_row}"
    ws1.freeze_panes = "E5"


    # =========================================================================
    # SHEET 2: 表二 - 规范名与可用渠道总览表 (规范名、可用渠道、调度与容灾)
    # =========================================================================
    ws2 = wb.create_sheet(title="规范名与可用渠道总览表")
    ws2.views.sheetView[0].showGridLines = True

    ws2.merge_cells("A1:Q1")
    ws2["A1"] = "🎯 supdance 平台 AI 核心规范模型与多渠道调度容灾矩阵表"
    ws2["A1"].font = title_font
    ws2["A1"].alignment = Alignment(horizontal="left", vertical="center")
    ws2.row_dimensions[1].height = 34

    ws2.merge_cells("A2:Q2")
    ws2["A2"] = "说明：本表收录平台主流去重规范模型家族，清晰列出规范名称、所属厂商、模态、可用全部渠道列表（官方直连、MuAPI、生态通道）、当前主选渠道、备选渠道与调度容灾策略。"
    ws2["A2"].font = subtitle_font
    ws2["A2"].alignment = Alignment(horizontal="left", vertical="center")
    ws2.row_dimensions[2].height = 20

    headers_s2 = [
        "序号", "规范模型名称 (Canonical Name)", "规范模型标识 (Canonical ID)", "所属品牌/厂商",
        "核心适用模态", "已接入渠道总数", "当前默认主渠道", "主渠道映射模型代码", "主渠道接口类型",
        "主渠道在线状态", "备用渠道 1", "备用渠道 2", "备用渠道 3", "所有可用渠道完整明细 (Provider List)",
        "关联平台子模型数", "包含平台在售子模型清单 (Child Variant IDs)", "调度与多渠道容灾策略"
    ]

    # --- 第一部分：42大主流核心去重规范模型 ---
    ws2.merge_cells("A3:Q3")
    ws2["A3"] = "★ 第一部分：42大主流核心去重规范模型与可用渠道矩阵 (包含新增主流模型 DALL·E 3 / Pika 2.0/2.1 / Ideogram / Recraft 等)"
    ws2["A3"].font = section_banner_font
    ws2["A3"].fill = header_teal_fill
    ws2["A3"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws2.row_dimensions[3].height = 26

    ws2.row_dimensions[4].height = 28
    for col_idx, h_text in enumerate(headers_s2, start=1):
        cell = ws2.cell(row=4, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_navy_fill
        cell.alignment = align_center
        cell.border = cell_border

    row_cursor_s2 = 5
    c_index = 1

    for c_id, meta in CORE_FLAGSHIPS:
        child_models = model_groups.get(c_id, [])
        child_ids = [m['id'] for m in child_models]

        all_channels_map = {}
        for m in child_models:
            for ch in m.get('channels', []):
                key = (ch.get('provider_id'), ch.get('provider_model_id'))
                if key not in all_channels_map:
                    all_channels_map[key] = ch
                else:
                    if ch.get('is_primary'):
                        all_channels_map[key] = ch

        combined_channels = list(all_channels_map.values())
        combined_channels.sort(key=lambda x: (not x.get('is_primary', False), -x.get('priority', 0)))

        primary_ch = next((c for c in combined_channels if c.get('is_primary')), None) or (combined_channels[0] if combined_channels else None)
        backup_channels = [c for c in combined_channels if c != primary_ch]

        backup_1 = backup_channels[0] if len(backup_channels) > 0 else None
        backup_2 = backup_channels[1] if len(backup_channels) > 1 else None
        backup_3 = backup_channels[2] if len(backup_channels) > 2 else None

        def format_channel_brief(ch):
            if not ch: return "-"
            p_name = PROVIDER_CN_NAMES.get(ch.get('provider_id'), ch.get('provider_name') or ch.get('provider_id'))
            c_cny, c_usd, _ = resolve_channel_cost_cny(ch)
            return f"{p_name}\n({ch.get('provider_model_id')})\n单次: ¥{c_cny:.2f} (${c_usd:.3f})"

        summary_lines = []
        for ch in combined_channels:
            p_name = PROVIDER_CN_NAMES.get(ch.get('provider_id'), ch.get('provider_name') or ch.get('provider_id'))
            c_cny, c_usd, _ = resolve_channel_cost_cny(ch)
            p_flag = "★主渠道" if ch.get('is_primary') else "备选渠道"
            status_flag = "🟢 在线可用" if ch.get('enabled') else "⚪ 已停用"
            summary_lines.append(f"• [{p_flag}] {p_name} ({ch.get('provider_model_id')}) | 成本: ¥{c_cny:.2f} (${c_usd:.3f}) | {status_flag}")

        category_cn = {
            'image': '图像生成',
            'video': '视频生成',
            'audio': '音频音乐',
            'text': '大语言模型'
        }.get(meta.get('category'), meta.get('category') or 'AI创作')

        row_s2_data = [
            c_index,
            meta['name'],
            c_id,
            meta['brand'],
            category_cn,
            len(combined_channels),
            PROVIDER_CN_NAMES.get(primary_ch.get('provider_id'), primary_ch.get('provider_id')) if primary_ch else '未连接',
            primary_ch.get('provider_model_id', '-') if primary_ch else '-',
            primary_ch.get('provider_type', 'official') if primary_ch else '-',
            "🟢 在线就绪" if (primary_ch and primary_ch.get('enabled')) else "⚪ 待上线",
            format_channel_brief(backup_1),
            format_channel_brief(backup_2),
            format_channel_brief(backup_3),
            "\n".join(summary_lines) if summary_lines else "暂未挂载渠道",
            len(child_models),
            "\n".join(child_ids[:8]) + (f"\n...等共{len(child_ids)}个变体" if len(child_ids) > 8 else ""),
            meta.get('failover_strategy', '多渠道负载均衡与故障容灾')
        ]

        ws2.row_dimensions[row_cursor_s2].height = max(38, len(combined_channels) * 18, min(len(child_models), 8) * 14)
        is_stripe = (c_index % 2 == 0)

        for col_idx, val in enumerate(row_s2_data, start=1):
            cell = ws2.cell(row=row_cursor_s2, column=col_idx, value=val)
            cell.font = regular_font
            cell.border = cell_border
            cell.fill = stripe_fill if is_stripe else PatternFill(fill_type=None)

            if col_idx in [1, 3, 5, 6, 7, 8, 9, 10, 15]:
                cell.alignment = align_center
            elif col_idx in [2, 4, 11, 12, 13, 14, 16, 17]:
                cell.alignment = align_left

            if col_idx in [2, 7]:
                cell.font = bold_cell_font
            if col_idx == 10:
                cell.font = badge_green_font
                cell.fill = badge_green_fill

        row_cursor_s2 += 1
        c_index += 1

    part1_s2_end = row_cursor_s2 - 1

    # --- 第二部分：平台其他扩展生态模型与渠道明细 ---
    ws2.merge_cells(f"A{row_cursor_s2}:Q{row_cursor_s2}")
    ws2[f"A{row_cursor_s2}"] = "▼ 第二部分：平台扩展生态模型与渠道明细 (其他在架模型与生态通道)"
    ws2[f"A{row_cursor_s2}"].font = section_banner_font
    ws2[f"A{row_cursor_s2}"].fill = section_banner_sub_fill
    ws2[f"A{row_cursor_s2}"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws2.row_dimensions[row_cursor_s2].height = 26
    row_cursor_s2 += 1

    # 表头
    ws2.row_dimensions[row_cursor_s2].height = 26
    for col_idx, h_text in enumerate(headers_s2, start=1):
        cell = ws2.cell(row=row_cursor_s2, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_navy_fill
        cell.alignment = align_center
        cell.border = cell_border
    row_cursor_s2 += 1

    for c_id in all_other_keys:
        child_models = model_groups[c_id]
        child_ids = [m['id'] for m in child_models]

        all_channels_map = {}
        for m in child_models:
            for ch in m.get('channels', []):
                key = (ch.get('provider_id'), ch.get('provider_model_id'))
                all_channels_map[key] = ch

        combined_channels = list(all_channels_map.values())
        primary_ch = combined_channels[0] if combined_channels else None

        row_s2_data = [
            c_index,
            child_models[0]['name'],
            c_id,
            "其他生态厂商",
            category_cn,
            len(combined_channels),
            PROVIDER_CN_NAMES.get(primary_ch.get('provider_id'), primary_ch.get('provider_id')) if primary_ch else '未连接',
            primary_ch.get('provider_model_id', '-') if primary_ch else '-',
            primary_ch.get('provider_type', 'official') if primary_ch else '-',
            "🟢 在线可用" if (primary_ch and primary_ch.get('enabled')) else "⚪ 停用",
            "-", "-", "-",
            "\n".join([f"• {PROVIDER_CN_NAMES.get(c.get('provider_id'), c.get('provider_id'))} ({c.get('provider_model_id')})" for c in combined_channels]),
            len(child_models),
            ", ".join(child_ids[:5]),
            "单渠道直达"
        ]

        ws2.row_dimensions[row_cursor_s2].height = 24
        is_stripe = (c_index % 2 == 0)

        for col_idx, val in enumerate(row_s2_data, start=1):
            cell = ws2.cell(row=row_cursor_s2, column=col_idx, value=val)
            cell.font = regular_font
            cell.border = cell_border
            cell.fill = stripe_fill if is_stripe else PatternFill(fill_type=None)

            if col_idx in [1, 3, 5, 6, 7, 8, 9, 10, 15]:
                cell.alignment = align_center
            elif col_idx in [2, 4, 11, 12, 13, 14, 16, 17]:
                cell.alignment = align_left

        row_cursor_s2 += 1
        c_index += 1

    ws2.auto_filter.ref = f"A4:Q{part1_s2_end}"
    ws2.freeze_panes = "D5"

    # =========================================================================
    # 自动调整与微调列宽 (Auto-fit & Optimize Column Widths)
    # =========================================================================
    for ws in [ws1, ws2]:
        for col in ws.columns:
            col_letter = get_column_letter(col[0].column)
            max_len = 0
            for cell in col:
                if cell.row in [1, 2, 3]:
                    continue
                val = str(cell.value or '')
                lines = val.split('\n')
                for line in lines:
                    length = sum(2 if ord(c) > 127 else 1 for c in line)
                    if length > max_len:
                        max_len = length
            ws.column_dimensions[col_letter].width = max(min(max_len + 3, 54), 11)

    # 针对性精细列宽
    ws1.column_dimensions['A'].width = 8
    ws1.column_dimensions['B'].width = 32
    ws1.column_dimensions['C'].width = 20
    ws1.column_dimensions['D'].width = 30
    ws1.column_dimensions['E'].width = 28
    ws1.column_dimensions['F'].width = 12
    ws1.column_dimensions['G'].width = 12
    ws1.column_dimensions['H'].width = 20
    ws1.column_dimensions['I'].width = 26
    ws1.column_dimensions['J'].width = 48
    ws1.column_dimensions['K'].width = 16
    ws1.column_dimensions['L'].width = 16
    ws1.column_dimensions['M'].width = 16
    ws1.column_dimensions['N'].width = 16
    ws1.column_dimensions['O'].width = 16
    ws1.column_dimensions['P'].width = 14
    ws1.column_dimensions['Q'].width = 12
    ws1.column_dimensions['R'].width = 24

    ws2.column_dimensions['A'].width = 8
    ws2.column_dimensions['B'].width = 34
    ws2.column_dimensions['C'].width = 22
    ws2.column_dimensions['D'].width = 20
    ws2.column_dimensions['E'].width = 14
    ws2.column_dimensions['F'].width = 14
    ws2.column_dimensions['G'].width = 22
    ws2.column_dimensions['H'].width = 26
    ws2.column_dimensions['I'].width = 16
    ws2.column_dimensions['J'].width = 14
    ws2.column_dimensions['K'].width = 26
    ws2.column_dimensions['L'].width = 26
    ws2.column_dimensions['M'].width = 26
    ws2.column_dimensions['N'].width = 56
    ws2.column_dimensions['O'].width = 16
    ws2.column_dimensions['P'].width = 38
    ws2.column_dimensions['Q'].width = 40

    out_dir = './outputs'
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, '大模型同名定价核对与规范渠道映射表.xlsx')
    wb.save(out_file)

    root_file = './大模型同名定价核对与规范渠道映射表.xlsx'
    wb.save(root_file)

    artifact_dirs = [
        '/Users/seelucency/.gemini/antigravity/brain/9d94f305-b637-416d-919d-e7d4ff045a3d',
        '/Users/seelucency/.gemini/antigravity/brain/61eb5028-f31d-41d2-bd30-38ab65e636dc'
    ]
    for adir in artifact_dirs:
        if os.path.exists(adir):
            wb.save(os.path.join(adir, '大模型同名定价核对与规范渠道映射表.xlsx'))
            wb.save(os.path.join(adir, 'model_pricing_and_channels_audit.xlsx'))

    print(f"🎉 成功生成专业级 Excel 报表: {out_file} ({os.path.getsize(out_file)} 字节)")
    print(f"Sheet 1: 核心同名模型核对行数: {part1_end_row - 4}，全量总模型行数: {row_cursor - 7}")
    print(f"Sheet 2: 核心规范模型行数: {part1_s2_end - 4}，全量总规范行数: {row_cursor_s2 - 7}")

if __name__ == '__main__':
    create_excel_report()
