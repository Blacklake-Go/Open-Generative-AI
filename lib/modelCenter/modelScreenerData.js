/**
 * KOYO Studio Model Telemetry & Screener Data Engine
 * 聚合全平台前沿大模型实时调用量、多模态产出量、端到端响应时延、集群负载、节点状态与时间序列数据。
 */

export const MODEL_CATEGORIES = [
  { id: 'all', label: 'All Models', labelZh: '全部模型', icon: 'Boxes' },
  { id: 'image', label: 'Text-to-Image', labelZh: '图像生成', icon: 'Image' },
  { id: 'video', label: 'Text-to-Video', labelZh: '视频生成', icon: 'Film' },
  { id: 'audio', label: 'Audio & Music', labelZh: '音频音乐', icon: 'Music' },
  { id: 'llm', label: 'LLM & Reasoning', labelZh: '大语言模型', icon: 'Cpu' },
  { id: 'multimodal', label: 'Multimodal', labelZh: '多模态智能', icon: 'Layers' },
];

export const TIMEFRAMES = [
  { id: '1h', label: 'Live (RPS)', labelZh: '实时', interval: '1m', count: 60 },
  { id: '24h', label: 'Hourly (24H)', labelZh: '时调用量', interval: '1h', count: 24 },
  { id: '7d', label: 'Daily (7D)', labelZh: '日调用量', interval: '1d', count: 7 },
  { id: '30d', label: 'Weekly (30D)', labelZh: '周/月调用量', interval: '1d', count: 30 },
  { id: '1y', label: 'Monthly (1Y)', labelZh: '月调用量', interval: '1mo', count: 12 },
];

export const METRIC_TYPES = [
  { id: 'invocations', label: 'Invocations', labelZh: '调用量', unit: '次', color: '#00f5d4' },
  { id: 'generations', label: 'Generations', labelZh: '模态产出量', unit: '件', color: '#3772FF' },
  { id: 'latency', label: 'Avg Latency', labelZh: '平均响应时延', unit: 'ms', color: '#fbbf24' },
  { id: 'sla', label: 'Cluster Load', labelZh: '节点健康度', unit: '%', color: '#10b981' },
];

// 核心大模型资产注册库
export const SCREENER_MODELS = [
  {
    id: 'deepseek-v3',
    symbol: 'DEEPSEEK:V3-671B',
    name: 'DeepSeek-V3 671B',
    provider: '深度求索 (DeepSeek)',
    providerId: 'deepseek',
    category: 'llm',
    categoryLabelZh: '大语言模型',
    type: 'MoE LLM',
    architecture: '671B MoE (37B Activated) + Multi-Head Latent Attention',
    parameters: '671 Billion Total',
    contextWindow: '128,000 tokens',
    maxResolution: 'N/A',
    duration: 'N/A',
    description: '全球现象级开源超级混合专家大模型，在代码、数学、多语种理解与创意思维上比肩顶尖闭源模型，极高性价比。',
    descriptionEn: 'Groundbreaking 671B MoE architecture with 37B activated parameters, delivering world-class coding and reasoning at scale.',
    priceRate: '2 算力点/1K Tokens',
    priceRateEn: '2 Credits / 1K Tokens',
    costUsd: 0.002,
    sla: 99.99,
    clusterLoad: 68,
    statusLevel: 'optimal',
    statusZh: '极速响应',
    statusSubZh: '负载 68% · MoE 动态路由',
    queueWait: '无排队 · 直连',
    outputUnit: 'Tokens',
    outputUnitEn: 'Tokens',
    liveOutputRate: '142k tok/s',
    activeTasks: 3850,
    peakConcurrency: '4,850 req',
    liveRps: 142.0,
    latencyMs: 185,
    ttftMs: 110,
    latencyBreakdownZh: '首字(TTFT) 110ms · 142 tok/s',
    latencyBreakdownEn: 'TTFT 110ms · 142 tok/s',
    p99LatencyMs: 380,
    packetLoss: '0.0005%',
    failoverMs: 45,
    qualityRatioZh: '代码推理 89%',
    qualityRatioEn: 'Code & Reasoning 89%',
    successRate: 99.99,
    calls24h: 12480600,
    callsChange24h: '+38.90%',
    isPositive: true,
    totalGenerations: 9840200,
    generationsChange24h: '+36.5%',
    timeframeCalls: {
      '1h': { calls: 520000, delta: '+11.5%', rps: 142.0, concurrency: 4850 },
      '24h': { calls: 12480600, delta: '+38.90%', rps: 135.0, concurrency: 4850 },
      '7d': { calls: 83500000, delta: '+32.40%', rps: 128.0, concurrency: 4600 },
      '30d': { calls: 352000000, delta: '+41.20%', rps: 122.0, concurrency: 4850 },
      '1y': { calls: 4100000000, delta: '+85.60%', rps: 115.0, concurrency: 4850 },
    },
    timeframeOutputs: {
      '1h': { value: 410000, delta: '+10.8%', liveRate: '142k tok/s', active: 3850 },
      '24h': { value: 9840200, delta: '+36.5%', liveRate: '142k tok/s', active: 3850 },
      '7d': { value: 65800000, delta: '+30.1%', liveRate: '142k tok/s', active: 3850 },
      '30d': { value: 278000000, delta: '+38.5%', liveRate: '142k tok/s', active: 3850 },
      '1y': { value: 3240000000, delta: '+79.2%', liveRate: '142k tok/s', active: 3850 },
    },
    pricingDetails: {
      baseCredits: 2,
      input1kTokens: '¥0.001',
      output1kTokens: '¥0.002',
      upscale4kMultiplier: '1.0x',
      vipDiscount: '至高 40% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 12, load: 72, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 16, load: 68, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 28, load: 58, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 48, load: 50, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 135, load: 64, status: 'normal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 154, load: 42, status: 'normal' },
    ],
    sparkline: [30, 42, 55, 68, 80, 92, 105, 118, 130, 142, 158, 175],
    seed: 104,
  },
  {
    id: 'gpt-4o',
    symbol: 'OPENAI:GPT-4O-OMNI',
    name: 'GPT-4o Omni',
    provider: 'OpenAI',
    providerId: 'openai',
    category: 'multimodal',
    categoryLabelZh: '多模态智能',
    type: 'Omni Multimodal',
    architecture: 'Native Multimodal Transformer (Audio/Vision/Text)',
    parameters: 'Estimated 200B+ MoE',
    contextWindow: '128,000 tokens',
    maxResolution: 'High-res Vision Tokens',
    duration: 'N/A',
    description: 'OpenAI 旗舰全模态智能基座，打通文本、视觉与实时音频，具备毫秒级响应、极致创意指导与精准代码生成。',
    descriptionEn: 'Flagship end-to-end multimodal model processing text, vision, and audio natively with unprecedented intelligence.',
    priceRate: '10 算力点/1K Tokens',
    priceRateEn: '10 Credits / 1K Tokens',
    costUsd: 0.010,
    sla: 99.99,
    clusterLoad: 64,
    statusLevel: 'optimal',
    statusZh: '极速直连',
    statusSubZh: '负载 64% · 全球 Anycast',
    queueWait: '无排队 · 直连',
    outputUnit: '次推理',
    outputUnitEn: 'inferences',
    liveOutputRate: '118 tok/s',
    activeTasks: 2420,
    peakConcurrency: '3,800 req',
    liveRps: 115.0,
    latencyMs: 220,
    ttftMs: 140,
    latencyBreakdownZh: '首字(TTFT) 140ms · 118 tok/s',
    latencyBreakdownEn: 'TTFT 140ms · 118 tok/s',
    p99LatencyMs: 460,
    packetLoss: '0.0006%',
    failoverMs: 50,
    qualityRatioZh: '全模态对齐 96%',
    qualityRatioEn: 'Multimodal Alignment 96%',
    successRate: 99.99,
    calls24h: 9850400,
    callsChange24h: '+15.20%',
    isPositive: true,
    totalGenerations: 7420100,
    generationsChange24h: '+14.1%',
    timeframeCalls: {
      '1h': { calls: 410000, delta: '+6.2%', rps: 115.0, concurrency: 3800 },
      '24h': { calls: 9850400, delta: '+15.20%', rps: 112.0, concurrency: 3800 },
      '7d': { calls: 65800000, delta: '+14.50%', rps: 108.0, concurrency: 3600 },
      '30d': { calls: 278000000, delta: '+18.20%', rps: 104.0, concurrency: 3800 },
      '1y': { calls: 3240000000, delta: '+48.50%', rps: 98.0, concurrency: 3800 },
    },
    timeframeOutputs: {
      '1h': { value: 310000, delta: '+5.8%', liveRate: '118 tok/s', active: 2420 },
      '24h': { value: 7420100, delta: '+14.1%', liveRate: '118 tok/s', active: 2420 },
      '7d': { value: 49500000, delta: '+13.2%', liveRate: '118 tok/s', active: 2420 },
      '30d': { value: 209000000, delta: '+17.4%', liveRate: '118 tok/s', active: 2420 },
      '1y': { value: 2440000000, delta: '+45.2%', liveRate: '118 tok/s', active: 2420 },
    },
    pricingDetails: {
      baseCredits: 10,
      input1kTokens: '¥0.015',
      output1kTokens: '¥0.045',
      upscale4kMultiplier: '1.0x',
      vipDiscount: '至高 25% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 25, load: 64, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 28, load: 60, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 32, load: 52, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 48, load: 48, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 124, load: 68, status: 'optimal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 146, load: 45, status: 'optimal' },
    ],
    sparkline: [70, 74, 72, 78, 84, 88, 92, 98, 104, 110, 118, 125],
    seed: 110,
  },
  {
    id: 'flux-dev',
    symbol: 'BFL:FLUX-1-DEV',
    name: 'FLUX.1 [dev]',
    provider: 'Black Forest Labs',
    providerId: 'bfl',
    category: 'image',
    categoryLabelZh: '文生图',
    type: 'Image DiT',
    architecture: '12B Rectified Flow Transformer',
    parameters: '12 Billion',
    contextWindow: '4,096 tokens',
    maxResolution: '2048 x 2048 (4K Upscaled)',
    duration: 'N/A',
    description: 'Black Forest Labs 开源旗舰生图大模型，以极高的照片级真实感、解剖学准确度与极致文字渲染闻名全球。',
    descriptionEn: 'Flagship open-weight 12B flow transformer by Black Forest Labs, leading text-to-image realism and typography adherence.',
    priceRate: '24 算力点/次',
    priceRateEn: '24 Credits / run',
    costUsd: 0.024,
    sla: 99.98,
    clusterLoad: 45,
    statusLevel: 'optimal',
    statusZh: '正常运行',
    statusSubZh: '负载 45% · H100 独享集群',
    queueWait: '无排队 · 直连',
    outputUnit: '张',
    outputUnitEn: 'imgs',
    liveOutputRate: '48.5 张/秒',
    activeTasks: 128,
    peakConcurrency: '1,420 req',
    liveRps: 48.5,
    latencyMs: 2420,
    ttftMs: 210,
    latencyBreakdownZh: '20步渲染 2.1s · 4K精修 3.8s',
    latencyBreakdownEn: '20-step 2.1s · 4K Hi-res 3.8s',
    p99LatencyMs: 3850,
    packetLoss: '0.001%',
    failoverMs: 85,
    qualityRatioZh: '4K渲染占比 34%',
    qualityRatioEn: '4K Ratio 34%',
    successRate: 99.98,
    calls24h: 3842100,
    callsChange24h: '+18.42%',
    isPositive: true,
    totalGenerations: 3120400,
    generationsChange24h: '+16.8%',
    timeframeCalls: {
      '1h': { calls: 160200, delta: '+5.4%', rps: 48.5, concurrency: 1420 },
      '24h': { calls: 3842100, delta: '+18.42%', rps: 44.5, concurrency: 1420 },
      '7d': { calls: 25804000, delta: '+15.20%', rps: 42.6, concurrency: 1380 },
      '30d': { calls: 108420000, delta: '+22.60%', rps: 41.8, concurrency: 1420 },
      '1y': { calls: 1245000000, delta: '+45.80%', rps: 39.5, concurrency: 1420 },
    },
    timeframeOutputs: {
      '1h': { value: 130100, delta: '+4.8%', liveRate: '48.5 张/秒', active: 128 },
      '24h': { value: 3120400, delta: '+16.8%', liveRate: '48.5 张/秒', active: 128 },
      '7d': { value: 20950000, delta: '+14.5%', liveRate: '48.5 张/秒', active: 128 },
      '30d': { value: 88100000, delta: '+21.4%', liveRate: '48.5 张/秒', active: 128 },
      '1y': { value: 1012000000, delta: '+42.1%', liveRate: '48.5 张/秒', active: 128 },
    },
    pricingDetails: {
      baseCredits: 24,
      input1kTokens: '¥0.012',
      output1kTokens: '¥0.036',
      upscale4kMultiplier: '1.6x',
      vipDiscount: '至高 25% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 18, load: 45, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 22, load: 38, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 32, load: 54, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 55, load: 48, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 142, load: 62, status: 'normal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 165, load: 39, status: 'normal' },
    ],
    sparkline: [42, 45, 48, 52, 50, 58, 64, 70, 75, 82, 88, 94],
    seed: 101,
  },
  {
    id: 'seedream-5.0',
    symbol: 'BYTEDANCE:SEEDREAM-5.0',
    name: 'Seedream 5.0 (即梦)',
    provider: '字节跳动 (ByteDance)',
    providerId: 'bytedance',
    category: 'image',
    categoryLabelZh: '文生图',
    type: 'Transformer Diffusion',
    architecture: 'ByteDance Generative Visual Foundation Model',
    parameters: '16 Billion',
    contextWindow: '4,096 tokens',
    maxResolution: '3840 x 2160 (4K Cinema)',
    duration: 'N/A',
    description: '字节跳动自研新一代超高清视觉生成基座，以强大的东方美学呈现、商业海报级细节与原生 4K 输出见长。',
    descriptionEn: 'ByteDance flagship creative visual foundation model with 4K cinema-grade rendering and oriental aesthetic mastery.',
    priceRate: '28 算力点/次',
    priceRateEn: '28 Credits / run',
    costUsd: 0.028,
    sla: 99.99,
    clusterLoad: 54,
    statusLevel: 'optimal',
    statusZh: '双活直连',
    statusSubZh: '负载 54% · 原生 4K 引擎',
    queueWait: '无排队 · 直连',
    outputUnit: '张',
    outputUnitEn: 'imgs',
    liveOutputRate: '42.0 张/秒',
    activeTasks: 96,
    peakConcurrency: '1,350 req',
    liveRps: 36.2,
    latencyMs: 3150,
    ttftMs: 240,
    latencyBreakdownZh: '原生4K 3.1s · 细节重绘 1.2s',
    latencyBreakdownEn: 'Native 4K 3.1s · Redraw 1.2s',
    p99LatencyMs: 4600,
    packetLoss: '0.0008%',
    failoverMs: 75,
    qualityRatioZh: '4K原生占比 48%',
    qualityRatioEn: 'Native 4K Ratio 48%',
    successRate: 99.99,
    calls24h: 3120500,
    callsChange24h: '+21.30%',
    isPositive: true,
    totalGenerations: 2680000,
    generationsChange24h: '+20.1%',
    timeframeCalls: {
      '1h': { calls: 130000, delta: '+6.8%', rps: 36.2, concurrency: 1350 },
      '24h': { calls: 3120500, delta: '+21.30%', rps: 34.5, concurrency: 1350 },
      '7d': { calls: 20800000, delta: '+18.50%', rps: 33.2, concurrency: 1300 },
      '30d': { calls: 87500000, delta: '+24.80%', rps: 32.8, concurrency: 1350 },
      '1y': { calls: 1020000000, delta: '+52.40%', rps: 31.0, concurrency: 1350 },
    },
    timeframeOutputs: {
      '1h': { value: 112000, delta: '+6.1%', liveRate: '42.0 张/秒', active: 96 },
      '24h': { value: 2680000, delta: '+20.1%', liveRate: '42.0 张/秒', active: 96 },
      '7d': { value: 17900000, delta: '+17.4%', liveRate: '42.0 张/秒', active: 96 },
      '30d': { value: 75200000, delta: '+23.5%', liveRate: '42.0 张/秒', active: 96 },
      '1y': { value: 875000000, delta: '+49.8%', liveRate: '42.0 张/秒', active: 96 },
    },
    pricingDetails: {
      baseCredits: 28,
      input1kTokens: '¥0.014',
      output1kTokens: '¥0.042',
      upscale4kMultiplier: '1.4x',
      vipDiscount: '至高 25% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 14, load: 58, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 18, load: 52, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 30, load: 46, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 50, load: 44, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 144, load: 60, status: 'normal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 168, load: 40, status: 'normal' },
    ],
    sparkline: [40, 48, 52, 60, 68, 76, 82, 88, 95, 102, 110, 118],
    seed: 106,
  },
  {
    id: 'gpt-image-2.5-flash',
    symbol: 'OPENAI:GPT-IMG-2.5F',
    name: 'GPT-Image 2.5 Flash',
    provider: 'OpenAI',
    providerId: 'openai',
    category: 'image',
    categoryLabelZh: '文生图',
    type: 'Multi-Stage Latent DiT',
    architecture: 'Next-Gen OpenAI Latent Diffusion',
    parameters: '14 Billion',
    contextWindow: '4,096 tokens',
    maxResolution: '1792 x 1024 / 1024 x 1792',
    duration: 'N/A',
    description: 'OpenAI 毫秒级闪电生图引擎，提示词指令遵循极其精密，专为即时设计灵感探索与高频商用创作优化。',
    descriptionEn: 'Sub-second image generation engine by OpenAI, tailored for conversational ideation and strict prompt instruction following.',
    priceRate: '18 算力点/次',
    priceRateEn: '18 Credits / run',
    costUsd: 0.018,
    sla: 99.98,
    clusterLoad: 38,
    statusLevel: 'optimal',
    statusZh: '闪电直连',
    statusSubZh: '负载 38% · 零排队',
    queueWait: '无排队 · 直连',
    outputUnit: '张',
    outputUnitEn: 'imgs',
    liveOutputRate: '36.2 张/秒',
    activeTasks: 74,
    peakConcurrency: '1,120 req',
    liveRps: 28.5,
    latencyMs: 1380,
    ttftMs: 160,
    latencyBreakdownZh: '闪电生成 1.3s · 贴合度 99%',
    latencyBreakdownEn: 'Flash 1.3s · Prompt Fit 99%',
    p99LatencyMs: 2200,
    packetLoss: '0.001%',
    failoverMs: 60,
    qualityRatioZh: '指令贴合 99.2%',
    qualityRatioEn: 'Prompt Fit 99.2%',
    successRate: 99.98,
    calls24h: 2450100,
    callsChange24h: '+9.45%',
    isPositive: true,
    totalGenerations: 2040000,
    generationsChange24h: '+8.9%',
    timeframeCalls: {
      '1h': { calls: 102000, delta: '+3.8%', rps: 28.5, concurrency: 1120 },
      '24h': { calls: 2450100, delta: '+9.45%', rps: 27.2, concurrency: 1120 },
      '7d': { calls: 16400000, delta: '+8.90%', rps: 26.5, concurrency: 1080 },
      '30d': { calls: 68900000, delta: '+12.40%', rps: 25.8, concurrency: 1120 },
      '1y': { calls: 795000000, delta: '+32.50%', rps: 24.5, concurrency: 1120 },
    },
    timeframeOutputs: {
      '1h': { value: 85000, delta: '+3.5%', liveRate: '36.2 张/秒', active: 74 },
      '24h': { value: 2040000, delta: '+8.9%', liveRate: '36.2 张/秒', active: 74 },
      '7d': { value: 13650000, delta: '+8.4%', liveRate: '36.2 张/秒', active: 74 },
      '30d': { value: 57400000, delta: '+11.8%', liveRate: '36.2 张/秒', active: 74 },
      '1y': { value: 662000000, delta: '+30.2%', liveRate: '36.2 张/秒', active: 74 },
    },
    pricingDetails: {
      baseCredits: 18,
      input1kTokens: '¥0.010',
      output1kTokens: '¥0.030',
      upscale4kMultiplier: '1.5x',
      vipDiscount: '至高 20% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 26, load: 38, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 29, load: 35, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 34, load: 45, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 52, load: 42, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 128, load: 58, status: 'optimal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 152, load: 36, status: 'normal' },
    ],
    sparkline: [60, 58, 62, 65, 68, 70, 72, 75, 78, 80, 84, 88],
    seed: 105,
  },
  {
    id: 'wan2.1-text-to-image',
    symbol: 'ALIBABA:WAN-2.1-T2I',
    name: '通义万相 2.1 (Wan 2.1)',
    provider: '阿里巴巴 (Alibaba)',
    providerId: 'alibaba',
    category: 'image',
    categoryLabelZh: '文生图',
    type: 'DiT Multi-lingual',
    architecture: 'Alibaba 14B Bi-lingual Visual Transformer',
    parameters: '14 Billion',
    contextWindow: '4,096 tokens',
    maxResolution: '2048 x 2048',
    duration: 'N/A',
    description: '阿里通义万相 2.1 大规模自研视觉基座，中文汉字书法排印与商业海报文案生成功力极强，准确率超 98%。',
    descriptionEn: 'Alibaba flagship bilingual visual transformer excelling in Chinese typography, commercial poster synthesis, and realistic lighting.',
    priceRate: '20 算力点/次',
    priceRateEn: '20 Credits / run',
    costUsd: 0.020,
    sla: 99.96,
    clusterLoad: 61,
    statusLevel: 'optimal',
    statusZh: '运行平稳',
    statusSubZh: '负载 61% · 阿里多模专网',
    queueWait: '无排队 · 直连',
    outputUnit: '张',
    outputUnitEn: 'imgs',
    liveOutputRate: '38.4 张/秒',
    activeTasks: 85,
    peakConcurrency: '980 req',
    liveRps: 22.8,
    latencyMs: 2850,
    ttftMs: 210,
    latencyBreakdownZh: '海报排版 2.8s · 中文汉字 98%',
    latencyBreakdownEn: 'Poster 2.8s · Typography 98%',
    p99LatencyMs: 4200,
    packetLoss: '0.0009%',
    failoverMs: 80,
    qualityRatioZh: '汉字排印准确 98.4%',
    qualityRatioEn: 'Typography 98.4%',
    successRate: 99.96,
    calls24h: 1980300,
    callsChange24h: '+12.80%',
    isPositive: true,
    totalGenerations: 1650000,
    generationsChange24h: '+11.9%',
    timeframeCalls: {
      '1h': { calls: 82500, delta: '+4.5%', rps: 22.8, concurrency: 980 },
      '24h': { calls: 1980300, delta: '+12.80%', rps: 21.6, concurrency: 980 },
      '7d': { calls: 13200000, delta: '+11.40%', rps: 20.8, concurrency: 940 },
      '30d': { calls: 55600000, delta: '+15.20%', rps: 20.2, concurrency: 980 },
      '1y': { calls: 642000000, delta: '+38.40%', rps: 19.4, concurrency: 980 },
    },
    timeframeOutputs: {
      '1h': { value: 68800, delta: '+4.1%', liveRate: '38.4 张/秒', active: 85 },
      '24h': { value: 1650000, delta: '+11.9%', liveRate: '38.4 张/秒', active: 85 },
      '7d': { value: 11000000, delta: '+10.8%', liveRate: '38.4 张/秒', active: 85 },
      '30d': { value: 46300000, delta: '+14.5%', liveRate: '38.4 张/秒', active: 85 },
      '1y': { value: 535000000, delta: '+36.2%', liveRate: '38.4 张/秒', active: 85 },
    },
    pricingDetails: {
      baseCredits: 20,
      input1kTokens: '¥0.010',
      output1kTokens: '¥0.030',
      upscale4kMultiplier: '1.5x',
      vipDiscount: '至高 30% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 12, load: 60, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 15, load: 56, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 30, load: 48, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 52, load: 45, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 140, load: 58, status: 'normal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 162, load: 40, status: 'normal' },
    ],
    sparkline: [48, 52, 50, 58, 64, 70, 75, 80, 84, 88, 92, 97],
    seed: 109,
  },
  {
    id: 'kling-v2.6-pro-t2v',
    symbol: 'KUAISHOU:KLING-2.6-PRO',
    name: 'Kling 2.6 Pro (可灵)',
    provider: '快手 (Kuaishou)',
    providerId: 'kuaishou',
    category: 'video',
    categoryLabelZh: '视频生成',
    type: 'Video DiT',
    architecture: 'Diffusion Video Transformer + 3D VAE',
    parameters: '18 Billion',
    contextWindow: '2,048 tokens',
    maxResolution: '1080P Full HD @ 60 FPS',
    duration: '5s / 10s',
    description: '快手自研顶尖视频生成模型，在复杂人体动态、大场景运镜、电影级光影质感与物理规律连续性上领先业界。',
    descriptionEn: 'Kuaishou state-of-the-art video model with cinematic camera paths, high-motion human dynamics, and physical consistency.',
    priceRate: '60 算力点/次',
    priceRateEn: '60 Credits / run',
    costUsd: 0.085,
    sla: 99.92,
    clusterLoad: 82,
    statusLevel: 'busy',
    statusZh: '高负载处理',
    statusSubZh: '负载 82% · 排队 1.4s',
    queueWait: '排队 1.4s',
    outputUnit: '段',
    outputUnitEn: 'vids',
    liveOutputRate: '12.4 段/分',
    activeTasks: 42,
    peakConcurrency: '890 req',
    liveRps: 14.8,
    latencyMs: 8650,
    ttftMs: 340,
    latencyBreakdownZh: '5s成片 8.6s · 60 FPS帧率',
    latencyBreakdownEn: '5s Video 8.6s · 60 FPS',
    p99LatencyMs: 14200,
    packetLoss: '0.002%',
    failoverMs: 110,
    qualityRatioZh: '1080P占比 82%',
    qualityRatioEn: '1080P Ratio 82%',
    successRate: 99.92,
    calls24h: 1824300,
    callsChange24h: '+24.15%',
    isPositive: true,
    totalGenerations: 1245000,
    generationsChange24h: '+22.4%',
    timeframeCalls: {
      '1h': { calls: 76000, delta: '+8.2%', rps: 14.8, concurrency: 890 },
      '24h': { calls: 1824300, delta: '+24.15%', rps: 13.5, concurrency: 890 },
      '7d': { calls: 12150000, delta: '+20.50%', rps: 12.8, concurrency: 850 },
      '30d': { calls: 51200000, delta: '+28.40%', rps: 12.2, concurrency: 890 },
      '1y': { calls: 580000000, delta: '+55.20%', rps: 11.5, concurrency: 890 },
    },
    timeframeOutputs: {
      '1h': { value: 51800, delta: '+7.6%', liveRate: '12.4 段/分', active: 42 },
      '24h': { value: 1245000, delta: '+22.4%', liveRate: '12.4 段/分', active: 42 },
      '7d': { value: 8300000, delta: '+18.9%', liveRate: '12.4 段/分', active: 42 },
      '30d': { value: 34900000, delta: '+26.2%', liveRate: '12.4 段/分', active: 42 },
      '1y': { value: 395000000, delta: '+51.8%', liveRate: '12.4 段/分', active: 42 },
    },
    pricingDetails: {
      baseCredits: 60,
      input1kTokens: '¥0.020',
      output1kTokens: '¥0.060',
      upscale4kMultiplier: '2.0x',
      vipDiscount: '至高 30% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 16, load: 62, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 20, load: 58, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 35, load: 49, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 58, load: 52, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 148, load: 70, status: 'normal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 172, load: 44, status: 'normal' },
    ],
    sparkline: [35, 42, 40, 52, 60, 68, 72, 78, 85, 90, 96, 104],
    seed: 102,
  },
  {
    id: 'midjourney-v7',
    symbol: 'MJ:V7-DIRECT',
    name: 'Midjourney V7',
    provider: 'Midjourney',
    providerId: 'midjourney',
    category: 'image',
    categoryLabelZh: '文生图',
    type: 'Artistic Diffusion',
    architecture: 'High-Dimensional Latent Diffusion Engine',
    parameters: 'Proprietary Ultra-Scale',
    contextWindow: '2,048 tokens',
    maxResolution: '2048 x 2048 Native',
    duration: 'N/A',
    description: '数字艺术与概念设计领头羊，以惊艳的光影氛围渲染、超强审美构图与独一无二的材质肌理表现力著称。',
    descriptionEn: 'The aesthetic benchmark for digital art, concept styling, and world-class texture rendering.',
    priceRate: '45 算力点/次',
    priceRateEn: '45 Credits / run',
    costUsd: 0.055,
    sla: 99.88,
    clusterLoad: 91,
    statusLevel: 'queued',
    statusZh: '算力排队中',
    statusSubZh: '负载 91% · 排队 2.8s',
    queueWait: '排队 2.8s',
    outputUnit: '张',
    outputUnitEn: 'imgs',
    liveOutputRate: '18.5 张/秒',
    activeTasks: 210,
    peakConcurrency: '850 req',
    liveRps: 19.5,
    latencyMs: 12500,
    ttftMs: 650,
    latencyBreakdownZh: '四宫格 12.5s · 细节放大 18.2s',
    latencyBreakdownEn: 'Grid 12.5s · Upscale 18.2s',
    p99LatencyMs: 18200,
    packetLoss: '0.0015%',
    failoverMs: 140,
    qualityRatioZh: '美学打分 9.6/10',
    qualityRatioEn: 'Aesthetic Score 9.6',
    successRate: 99.88,
    calls24h: 1680400,
    callsChange24h: '+7.85%',
    isPositive: true,
    totalGenerations: 1420000,
    generationsChange24h: '+7.2%',
    timeframeCalls: {
      '1h': { calls: 70000, delta: '+2.8%', rps: 19.5, concurrency: 850 },
      '24h': { calls: 1680400, delta: '+7.85%', rps: 18.2, concurrency: 850 },
      '7d': { calls: 11200000, delta: '+7.40%', rps: 17.5, concurrency: 820 },
      '30d': { calls: 47200000, delta: '+10.50%', rps: 17.0, concurrency: 850 },
      '1y': { calls: 545000000, delta: '+28.40%', rps: 16.2, concurrency: 850 },
    },
    timeframeOutputs: {
      '1h': { value: 59000, delta: '+2.5%', liveRate: '18.5 张/秒', active: 210 },
      '24h': { value: 1420000, delta: '+7.2%', liveRate: '18.5 张/秒', active: 210 },
      '7d': { value: 9500000, delta: '+6.8%', liveRate: '18.5 张/秒', active: 210 },
      '30d': { value: 39800000, delta: '+9.8%', liveRate: '18.5 张/秒', active: 210 },
      '1y': { value: 462000000, delta: '+26.5%', liveRate: '18.5 张/秒', active: 210 },
    },
    pricingDetails: {
      baseCredits: 45,
      input1kTokens: '¥0.020',
      output1kTokens: '¥0.065',
      upscale4kMultiplier: '1.8x',
      vipDiscount: '至高 20% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 32, load: 48, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 35, load: 45, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 40, load: 50, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 58, load: 52, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 132, load: 62, status: 'optimal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 156, load: 44, status: 'normal' },
    ],
    sparkline: [65, 62, 68, 70, 72, 75, 78, 80, 82, 85, 88, 92],
    seed: 111,
  },
  {
    id: 'minimax-hailuo-2.3-standard-t2v',
    symbol: 'MINIMAX:HAILUO-2.3',
    name: 'Hailuo 2.3 (海螺视频)',
    provider: 'MiniMax',
    providerId: 'minimax',
    category: 'video',
    categoryLabelZh: '视频生成',
    type: 'Video Foundation',
    architecture: 'MiniMax Spatial-Temporal Autoregressive Diffusion',
    parameters: '15 Billion',
    contextWindow: '2,048 tokens',
    maxResolution: '1080P Cinema Grade',
    duration: '6s / 10s',
    description: 'MiniMax 影视级文生视频与图生视频旗舰，以逼真细腻的面部微表情、超大镜头推拉及复杂物理交互领跑。',
    descriptionEn: 'MiniMax cinematic text/image-to-video flagship renowned for subtle facial expressions and complex physical world dynamics.',
    priceRate: '55 算力点/次',
    priceRateEn: '55 Credits / run',
    costUsd: 0.078,
    sla: 99.94,
    clusterLoad: 75,
    statusLevel: 'busy',
    statusZh: '动态负载',
    statusSubZh: '负载 75% · 等待 0.8s',
    queueWait: '等待 0.8s',
    outputUnit: '段',
    outputUnitEn: 'vids',
    liveOutputRate: '10.8 段/分',
    activeTasks: 36,
    peakConcurrency: '720 req',
    liveRps: 12.0,
    latencyMs: 9120,
    ttftMs: 380,
    latencyBreakdownZh: '5s物理成片 9.1s · 表情贴合 98%',
    latencyBreakdownEn: '5s Physics 9.1s · Expression 98%',
    p99LatencyMs: 15400,
    packetLoss: '0.002%',
    failoverMs: 105,
    qualityRatioZh: '表情微动贴合 98%',
    qualityRatioEn: 'Expression 98%',
    successRate: 99.94,
    calls24h: 1420800,
    callsChange24h: '+16.75%',
    isPositive: true,
    totalGenerations: 980200,
    generationsChange24h: '+15.2%',
    timeframeCalls: {
      '1h': { calls: 59000, delta: '+5.8%', rps: 12.0, concurrency: 720 },
      '24h': { calls: 1420800, delta: '+16.75%', rps: 11.2, concurrency: 720 },
      '7d': { calls: 9450000, delta: '+15.20%', rps: 10.5, concurrency: 690 },
      '30d': { calls: 39800000, delta: '+19.40%', rps: 10.0, concurrency: 720 },
      '1y': { calls: 450000000, delta: '+42.50%', rps: 9.5, concurrency: 720 },
    },
    timeframeOutputs: {
      '1h': { value: 40800, delta: '+5.2%', liveRate: '10.8 段/分', active: 36 },
      '24h': { value: 980200, delta: '+15.2%', liveRate: '10.8 段/分', active: 36 },
      '7d': { value: 6520000, delta: '+14.1%', liveRate: '10.8 段/分', active: 36 },
      '30d': { value: 27400000, delta: '+18.2%', liveRate: '10.8 段/分', active: 36 },
      '1y': { value: 310000000, delta: '+39.8%', liveRate: '10.8 段/分', active: 36 },
    },
    pricingDetails: {
      baseCredits: 55,
      input1kTokens: '¥0.018',
      output1kTokens: '¥0.055',
      upscale4kMultiplier: '1.8x',
      vipDiscount: '至高 25% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 18, load: 55, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 22, load: 50, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 34, load: 48, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 54, load: 46, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 146, load: 66, status: 'normal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 170, load: 42, status: 'normal' },
    ],
    sparkline: [45, 42, 48, 54, 60, 65, 72, 78, 82, 86, 92, 98],
    seed: 107,
  },
  {
    id: 'suno-create-music',
    symbol: 'SUNO:V3.5-STUDIO',
    name: 'Suno V3.5 Music',
    provider: 'Suno AI',
    providerId: 'suno',
    category: 'audio',
    categoryLabelZh: '音频音乐',
    type: 'Audio LLM',
    architecture: 'Autoregressive Discrete Acoustic Model',
    parameters: '8 Billion',
    contextWindow: '8,192 tokens',
    maxResolution: '48 kHz / 24-bit Stereo Lossless',
    duration: '240s Full Song',
    description: '全球流行音乐生成领跑者，支持多语种真实人声演唱、全流派配器编曲、结构化主歌/副歌编排。',
    descriptionEn: 'Industry leading music AI supporting multi-genre instrumentals, high-fidelity human vocals, and full-structure song generation.',
    priceRate: '30 算力点/次',
    priceRateEn: '30 Credits / run',
    costUsd: 0.035,
    sla: 99.97,
    clusterLoad: 42,
    statusLevel: 'optimal',
    statusZh: '正常运行',
    statusSubZh: '负载 42% · 无损音频管线',
    queueWait: '无排队 · 直连',
    outputUnit: '首',
    outputUnitEn: 'tracks',
    liveOutputRate: '28.0 首/分',
    activeTasks: 19,
    peakConcurrency: '640 req',
    liveRps: 11.2,
    latencyMs: 4120,
    ttftMs: 180,
    latencyBreakdownZh: '首段缓冲 1.2s · 全曲 4.1s',
    latencyBreakdownEn: 'Buffer 1.2s · Full 4.1s',
    p99LatencyMs: 6800,
    packetLoss: '0.001%',
    failoverMs: 95,
    qualityRatioZh: '双语人声 78%',
    qualityRatioEn: 'Vocal Ratio 78%',
    successRate: 99.97,
    calls24h: 968400,
    callsChange24h: '+14.62%',
    isPositive: true,
    totalGenerations: 820100,
    generationsChange24h: '+13.2%',
    timeframeCalls: {
      '1h': { calls: 40300, delta: '+3.9%', rps: 11.2, concurrency: 640 },
      '24h': { calls: 968400, delta: '+14.62%', rps: 10.4, concurrency: 640 },
      '7d': { calls: 6480000, delta: '+12.40%', rps: 9.8, concurrency: 620 },
      '30d': { calls: 27200000, delta: '+17.80%', rps: 9.4, concurrency: 640 },
      '1y': { calls: 310000000, delta: '+38.50%', rps: 8.9, concurrency: 640 },
    },
    timeframeOutputs: {
      '1h': { value: 34100, delta: '+3.5%', liveRate: '28.0 首/分', active: 19 },
      '24h': { value: 820100, delta: '+13.2%', liveRate: '28.0 首/分', active: 19 },
      '7d': { value: 5490000, delta: '+11.2%', liveRate: '28.0 首/分', active: 19 },
      '30d': { value: 23100000, delta: '+16.1%', liveRate: '28.0 首/分', active: 19 },
      '1y': { value: 263000000, delta: '+35.2%', liveRate: '28.0 首/分', active: 19 },
    },
    pricingDetails: {
      baseCredits: 30,
      input1kTokens: '¥0.015',
      output1kTokens: '¥0.045',
      upscale4kMultiplier: '1.2x',
      vipDiscount: '至高 20% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 24, load: 41, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 28, load: 36, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 38, load: 46, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 62, load: 40, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 136, load: 55, status: 'optimal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 158, load: 38, status: 'normal' },
    ],
    sparkline: [50, 48, 55, 62, 58, 66, 74, 80, 84, 88, 92, 98],
    seed: 103,
  },
  {
    id: 'veo3-text-to-video',
    symbol: 'GOOGLE:VEO-3-GEN',
    name: 'Google Veo 3',
    provider: 'Google DeepMind',
    providerId: 'google',
    category: 'video',
    categoryLabelZh: '视频生成',
    type: 'Multimodal Video',
    architecture: 'DeepMind Native Multimodal Generative Video Network',
    parameters: '24 Billion',
    contextWindow: '4,096 tokens',
    maxResolution: '1080P Native (4K Cinema Post)',
    duration: '8s Extended',
    description: '谷歌 DeepMind 原生视听多模态生成模型，深度理解电影专业镜头语言（升降镜头、景深虚化、快速摇移）。',
    descriptionEn: 'DeepMind native audio-visual video model mastering cinematic framing, focus pulling, and fluid temporal coherence.',
    priceRate: '75 算力点/次',
    priceRateEn: '75 Credits / run',
    costUsd: 0.110,
    sla: 99.85,
    clusterLoad: 88,
    statusLevel: 'queued',
    statusZh: '算力排队中',
    statusSubZh: '负载 88% · 排队 3.5s',
    queueWait: '排队 3.5s',
    outputUnit: '段',
    outputUnitEn: 'vids',
    liveOutputRate: '6.4 段/分',
    activeTasks: 58,
    peakConcurrency: '480 req',
    liveRps: 7.8,
    latencyMs: 12400,
    ttftMs: 420,
    latencyBreakdownZh: '8s原生电影级 12.4s · 深度镜头',
    latencyBreakdownEn: '8s Cinema 12.4s · Camera Paths',
    p99LatencyMs: 18900,
    packetLoss: '0.001%',
    failoverMs: 120,
    qualityRatioZh: '原生电影运镜 88%',
    qualityRatioEn: 'Cinema Camera 88%',
    successRate: 99.85,
    calls24h: 890400,
    callsChange24h: '+8.12%',
    isPositive: true,
    totalGenerations: 580100,
    generationsChange24h: '+7.4%',
    timeframeCalls: {
      '1h': { calls: 37000, delta: '+2.9%', rps: 7.8, concurrency: 480 },
      '24h': { calls: 890400, delta: '+8.12%', rps: 7.2, concurrency: 480 },
      '7d': { calls: 5920000, delta: '+7.50%', rps: 6.8, concurrency: 450 },
      '30d': { calls: 24900000, delta: '+10.80%', rps: 6.5, concurrency: 480 },
      '1y': { calls: 285000000, delta: '+25.40%', rps: 6.0, concurrency: 480 },
    },
    timeframeOutputs: {
      '1h': { value: 24100, delta: '+2.5%', liveRate: '6.4 段/分', active: 58 },
      '24h': { value: 580100, delta: '+7.4%', liveRate: '6.4 段/分', active: 58 },
      '7d': { value: 3860000, delta: '+6.9%', liveRate: '6.4 段/分', active: 58 },
      '30d': { value: 16200000, delta: '+9.9%', liveRate: '6.4 段/分', active: 58 },
      '1y': { value: 185000000, delta: '+23.8%', liveRate: '6.4 段/分', active: 58 },
    },
    pricingDetails: {
      baseCredits: 75,
      input1kTokens: '¥0.025',
      output1kTokens: '¥0.080',
      upscale4kMultiplier: '2.2x',
      vipDiscount: '至高 20% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 30, load: 42, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 34, load: 38, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 38, load: 44, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 50, load: 48, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 122, load: 56, status: 'optimal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 148, load: 36, status: 'optimal' },
    ],
    sparkline: [55, 52, 58, 62, 60, 68, 72, 75, 78, 82, 85, 89],
    seed: 108,
  },
  {
    id: 'minimax-music-3.0',
    symbol: 'MINIMAX:MUSIC-3.0',
    name: 'MiniMax Music 3.0',
    provider: 'MiniMax',
    providerId: 'minimax',
    category: 'audio',
    categoryLabelZh: '音频音乐',
    type: 'Audio Acoustic',
    architecture: 'MiniMax Next-Gen Neural Music Synthesizer',
    parameters: '7 Billion',
    contextWindow: '4,096 tokens',
    maxResolution: '48 kHz Stereo',
    duration: '180s Full Track',
    description: '支持中文与英文双语流畅演唱，流行电音、民谣古风及影视配乐一键合成，人声气息感与咬字极佳。',
    descriptionEn: 'Neural music synthesizer excelling in bilingual vocals, pop/electronic arrangements, and emotional nuance.',
    priceRate: '25 算力点/次',
    priceRateEn: '25 Credits / run',
    costUsd: 0.028,
    sla: 99.98,
    clusterLoad: 36,
    statusLevel: 'optimal',
    statusZh: '正常运行',
    statusSubZh: '负载 36% · 双语人声集群',
    queueWait: '无排队 · 直连',
    outputUnit: '首',
    outputUnitEn: 'tracks',
    liveOutputRate: '22.0 首/分',
    activeTasks: 14,
    peakConcurrency: '420 req',
    liveRps: 7.2,
    latencyMs: 3820,
    ttftMs: 190,
    latencyBreakdownZh: '首段缓冲 0.9s · 全曲 3.8s',
    latencyBreakdownEn: 'Buffer 0.9s · Full 3.8s',
    p99LatencyMs: 5800,
    packetLoss: '0.001%',
    failoverMs: 90,
    qualityRatioZh: '电音民谣流派 94%',
    qualityRatioEn: 'Multi-genre 94%',
    successRate: 99.98,
    calls24h: 620500,
    callsChange24h: '+11.20%',
    isPositive: true,
    totalGenerations: 510000,
    generationsChange24h: '+10.5%',
    timeframeCalls: {
      '1h': { calls: 25800, delta: '+4.1%', rps: 7.2, concurrency: 420 },
      '24h': { calls: 620500, delta: '+11.20%', rps: 6.8, concurrency: 420 },
      '7d': { calls: 4150000, delta: '+10.50%', rps: 6.4, concurrency: 400 },
      '30d': { calls: 17400000, delta: '+13.80%', rps: 6.1, concurrency: 420 },
      '1y': { calls: 198000000, delta: '+31.20%', rps: 5.8, concurrency: 420 },
    },
    timeframeOutputs: {
      '1h': { value: 21200, delta: '+3.8%', liveRate: '22.0 首/分', active: 14 },
      '24h': { value: 510000, delta: '+10.5%', liveRate: '22.0 首/分', active: 14 },
      '7d': { value: 3410000, delta: '+9.8%', liveRate: '22.0 首/分', active: 14 },
      '30d': { value: 14300000, delta: '+12.9%', liveRate: '22.0 首/分', active: 14 },
      '1y': { value: 162000000, delta: '+29.4%', liveRate: '22.0 首/分', active: 14 },
    },
    pricingDetails: {
      baseCredits: 25,
      input1kTokens: '¥0.012',
      output1kTokens: '¥0.038',
      upscale4kMultiplier: '1.2x',
      vipDiscount: '至高 25% 优惠',
    },
    gateways: [
      { region: '华东节点 (上海)', regionEn: 'East China (Shanghai)', ping: 18, load: 38, status: 'optimal' },
      { region: '华南节点 (广州)', regionEn: 'South China (Guangzhou)', ping: 22, load: 35, status: 'optimal' },
      { region: '香港专线 (Hong Kong)', regionEn: 'Hong Kong Gateway', ping: 32, load: 42, status: 'optimal' },
      { region: '亚太核心 (新加坡)', regionEn: 'Asia Pacific (Singapore)', ping: 54, load: 40, status: 'optimal' },
      { region: '美西中心 (硅谷)', regionEn: 'US West (Silicon Valley)', ping: 144, load: 52, status: 'normal' },
      { region: '欧洲法兰克福 (EU)', regionEn: 'EU Central (Frankfurt)', ping: 168, load: 36, status: 'normal' },
    ],
    sparkline: [42, 45, 48, 52, 55, 60, 64, 68, 72, 76, 80, 85],
    seed: 112,
  },
];

/**
 * 获取所有大模型总览数据
 */
export function getAllScreenerModels() {
  return SCREENER_MODELS;
}

/**
 * 根据模型 ID 获取特定模型档案
 */
export function getModelById(id) {
  if (!id) return null;
  const targetId = String(id).toLowerCase().trim();
  const direct = SCREENER_MODELS.find((m) => m.id.toLowerCase() === targetId);
  if (direct) return direct;

  // 模糊匹配兼容
  return (
    SCREENER_MODELS.find(
      (m) =>
        m.id.toLowerCase().includes(targetId) ||
        targetId.includes(m.id.toLowerCase()) ||
        m.symbol.toLowerCase().includes(targetId)
    ) || SCREENER_MODELS[0]
  );
}

/**
 * 确定性伪随机数生成器（保证相同模型在各时间刻度上渲染一致平滑且逼真的真实曲线）
 */
function pseudoRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

/**
 * 根据所选时间维度动态计算量化指标
 * @param {object} model
 * @param {string} timeframe ('1h' | '24h' | '7d' | '30d' | '1y')
 * @param {number} liveDelta
 */
export function getModelTimeframeStats(model, timeframe = '24h', liveDelta = 0) {
  const tf = timeframe || '24h';
  const isRealtime = tf === '1h';

  const callsData = model.timeframeCalls?.[tf] || {
    calls: model.calls24h || 1000000,
    delta: model.callsChange24h || '+12.4%',
    rps: model.liveRps || 24,
    concurrency: parseInt(String(model.peakConcurrency || '1000').replace(/[^0-9]/g, '')) || 1000,
  };
  const outputsData = model.timeframeOutputs?.[tf] || {
    value: model.totalGenerations || 800000,
    delta: model.generationsChange24h || '+10.8%',
    liveRate: model.liveOutputRate || '24/s',
    active: model.activeTasks || 50,
  };

  if (isRealtime) {
    // 实时状态：微动数值模拟
    const deltaWobble = Math.sin(liveDelta * 1.5 + (model.seed || 100)) * 14;
    const currentConcurrency = Math.max(10, Math.round(callsData.concurrency + deltaWobble));
    const currentActiveTasks = Math.max(2, Math.round(outputsData.active + Math.cos(liveDelta * 1.2) * 3));
    const currentRps = (callsData.rps * (1 + Math.sin(liveDelta) * 0.04)).toFixed(1);

    return {
      timeframe: '1h',
      isRealtime: true,
      // 第一主列：实时并发与 RPS
      callsPrimary: `${currentConcurrency.toLocaleString()}`,
      callsUnit: '并发',
      callsUnitEn: 'active conc',
      callsSub: `${currentRps} req/s`,
      callsRaw: currentConcurrency,
      callsDelta: callsData.delta,
      isCallsPositive: true,
      callsHeaderZh: '实时并发 / 请求率',
      callsHeaderEn: 'Live Concurrency / RPS',

      // 第二主列：实时产出与生成中任务
      outputPrimary: outputsData.liveRate,
      outputSub: `${currentActiveTasks} ${model.outputUnit || '件'}正在生成`,
      outputSubEn: `${currentActiveTasks} ${model.outputUnitEn || 'items'} running`,
      outputRaw: currentActiveTasks,
      outputDelta: outputsData.delta,
      isOutputPositive: true,
      outputHeaderZh: '实时出图与产出吞吐',
      outputHeaderEn: 'Live Throughput / Active',
      outputUnit: model.outputUnit || '件',
    };
  }

  // 周期调用量格式化
  const rawCalls = callsData.calls;
  let callsDisplay = '';
  if (rawCalls >= 100000000) {
    callsDisplay = `${(rawCalls / 100000000).toFixed(2)}亿`;
  } else if (rawCalls >= 10000) {
    callsDisplay = `${(rawCalls / 10000).toFixed(1)}w`;
  } else {
    callsDisplay = rawCalls.toLocaleString();
  }

  // 周期产出量格式化
  const rawOutputs = outputsData.value;
  let outputDisplay = '';
  if (model.outputUnit === 'Tokens') {
    if (rawOutputs >= 1000000) {
      outputDisplay = `${(rawOutputs / 1000000).toFixed(1)}B`;
    } else {
      outputDisplay = `${(rawOutputs / 1000).toFixed(1)}M`;
    }
  } else if (rawOutputs >= 100000000) {
    outputDisplay = `${(rawOutputs / 100000000).toFixed(2)}亿`;
  } else if (rawOutputs >= 10000) {
    outputDisplay = `${(rawOutputs / 10000).toFixed(1)}w`;
  } else {
    outputDisplay = rawOutputs.toLocaleString();
  }

  const headerMap = {
    '24h': {
      callsZh: '24H 调用量',
      callsEn: '24h Invocations',
      outputZh: '24H 累计产出',
      outputEn: '24h Generations',
      outputSub: model.qualityRatioZh || '质量稳定',
    },
    '7d': {
      callsZh: '7D 调用量',
      callsEn: '7d Invocations',
      outputZh: '7D 累计产出',
      outputEn: '7d Generations',
      outputSub: `成功率 ${model.successRate || 99.9}%`,
    },
    '30d': {
      callsZh: '30D 月调用量',
      callsEn: '30d Invocations',
      outputZh: '30D 累计产出',
      outputEn: '30d Generations',
      outputSub: model.qualityRatioZh || '质量稳定',
    },
    '1y': {
      callsZh: '年度调用量',
      callsEn: 'Annual Invocations',
      outputZh: '年度累计产出',
      outputEn: 'Annual Generations',
      outputSub: `可用率 ${model.sla}%`,
    },
  };

  const h = headerMap[tf] || headerMap['24h'];

  return {
    timeframe: tf,
    isRealtime: false,
    callsPrimary: callsDisplay,
    callsUnit: '次',
    callsUnitEn: 'calls',
    callsSub: `峰值并发: ${model.peakConcurrency}`,
    callsRaw: rawCalls,
    callsDelta: callsData.delta,
    isCallsPositive: !callsData.delta.startsWith('-'),
    callsHeaderZh: h.callsZh,
    callsHeaderEn: h.callsEn,

    outputPrimary: outputDisplay,
    outputSub: h.outputSub,
    outputSubEn: model.qualityRatioEn || 'Optimal',
    outputRaw: rawOutputs,
    outputDelta: outputsData.delta,
    isOutputPositive: !outputsData.delta.startsWith('-'),
    outputHeaderZh: h.outputZh,
    outputHeaderEn: h.outputEn,
    outputUnit: model.outputUnit || '件',
  };
}

/**
 * 生成高保真时间序列折线数据与成交量柱状图
 * @param {string} modelId
 * @param {'1h' | '24h' | '7d' | '30d' | '1y' | 'all'} timeframe
 * @param {'invocations' | 'generations' | 'latency' | 'sla'} metric
 */
export function getModelTimeSeries(modelId, timeframe = '24h', metric = 'invocations') {
  const model = getModelById(modelId) || SCREENER_MODELS[0];
  const tfConfig = TIMEFRAMES.find((t) => t.id === timeframe) || TIMEFRAMES[1];
  const count = tfConfig.count;

  let baseValue = 1000;
  let volatility = 0.15;
  let trendSlope = 1.02;

  if (metric === 'invocations') {
    if (timeframe === '1h') baseValue = Math.round(model.calls24h / 1440);
    else if (timeframe === '24h') baseValue = Math.round(model.calls24h / 24);
    else if (timeframe === '7d') baseValue = Math.round(model.calls24h);
    else if (timeframe === '30d') baseValue = Math.round(model.calls24h);
    else baseValue = Math.round(model.calls24h * 30);
    trendSlope = 1.015;
  } else if (metric === 'generations') {
    if (timeframe === '1h') baseValue = Math.round(model.totalGenerations / 1440);
    else if (timeframe === '24h') baseValue = Math.round(model.totalGenerations / 24);
    else if (timeframe === '7d') baseValue = Math.round(model.totalGenerations);
    else if (timeframe === '30d') baseValue = Math.round(model.totalGenerations);
    else baseValue = Math.round(model.totalGenerations * 30);
    trendSlope = 1.014;
  } else if (metric === 'latency') {
    baseValue = model.latencyMs;
    volatility = 0.08;
    trendSlope = 0.995;
  } else if (metric === 'sla') {
    baseValue = model.sla;
    volatility = 0.0008;
    trendSlope = 1.0001;
  }

  const series = [];
  let currentValue = baseValue * 0.85;
  let seed = model.seed * 37 + (timeframe.charCodeAt(0) || 1);

  const now = new Date();

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1 || 1);
    const noise = (pseudoRandom(seed++) - 0.48) * volatility * 2;
    const wave = Math.sin(i * 0.6 + model.seed) * (baseValue * 0.05);

    if (metric === 'sla') {
      currentValue = Math.min(100, Math.max(99.85, 99.98 + (pseudoRandom(seed++) - 0.5) * 0.04));
    } else {
      currentValue = Math.max(
        baseValue * 0.3,
        (currentValue * (1 + noise) + wave) * (1 + (trendSlope - 1) * 0.1)
      );
    }

    const timeOffsetMs = (count - 1 - i) * getTimeStepMs(timeframe);
    const pointDate = new Date(now.getTime() - timeOffsetMs);
    const timeLabel = formatTimeLabel(pointDate, timeframe);

    const volumeBase = Math.round((currentValue / baseValue) * 100);
    const isUp = i > 0 ? currentValue >= series[i - 1].value : true;

    series.push({
      index: i,
      timestamp: pointDate.toISOString(),
      label: timeLabel,
      value: Math.round(currentValue * 10) / 10,
      volume: Math.max(10, Math.round(volumeBase * (0.8 + pseudoRandom(seed++) * 0.4))),
      isUp,
      latency: Math.round(model.latencyMs * (0.92 + pseudoRandom(seed++) * 0.16)),
      generations: Math.round(currentValue * 0.82),
    });
  }

  if (series.length > 0) {
    if (metric === 'invocations') series[series.length - 1].value = Math.round(baseValue * 1.05);
    else if (metric === 'generations') series[series.length - 1].value = Math.round(baseValue * 0.88);
    else if (metric === 'latency') series[series.length - 1].value = model.latencyMs;
    else if (metric === 'sla') series[series.length - 1].value = model.sla;
  }

  return series;
}

function getTimeStepMs(timeframe) {
  switch (timeframe) {
    case '1h': return 60 * 1000;
    case '24h': return 60 * 60 * 1000;
    case '7d': return 24 * 60 * 60 * 1000;
    case '30d': return 24 * 60 * 60 * 1000;
    case '1y': return 30 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

function formatTimeLabel(date, timeframe) {
  const pad = (n) => String(n).padStart(2, '0');
  if (timeframe === '1h') {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (timeframe === '24h') {
    return `${pad(date.getHours())}:00`;
  }
  if (timeframe === '7d' || timeframe === '30d') {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/**
 * 全平台全局实时算力总览统计
 */
export function getGlobalTelemetryStats() {
  const totalCalls24h = SCREENER_MODELS.reduce((acc, m) => acc + m.calls24h, 0);
  const totalGenerations = SCREENER_MODELS.reduce((acc, m) => acc + m.totalGenerations, 0);
  const avgLatency = Math.round(
    SCREENER_MODELS.reduce((acc, m) => acc + m.latencyMs, 0) / SCREENER_MODELS.length
  );
  const activeModelsCount = SCREENER_MODELS.length;

  return {
    totalCalls24h: '38,245,800',
    totalCallsDelta: '+21.4%',
    totalGenerations: '26,890,200',
    totalGenerationsDelta: '+19.8%',
    avgLatencyMs: `${avgLatency} ms`,
    avgLatencyLabel: '全网加权时延',
    activeModelsCount: `${activeModelsCount} / ${activeModelsCount}`,
    globalSla: '99.98%',
    edgeNodesCount: '28+ 全球加速节点',
  };
}
