import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const cwd = process.cwd();
  const { queryMany } = await import(path.join(cwd, 'lib/db/index.js'));
  const { listActiveModels } = await import(path.join(cwd, 'lib/services/models.js'));
  const { getServerProviderApiKey } = await import(path.join(cwd, 'lib/services/providerSecrets.js'));
  const { hasProviderAdapter } = await import(path.join(cwd, 'lib/adapters/index.js'));
  const { isSelectablePublicModel } = await import(path.join(cwd, 'lib/modelCenter/publicDirectory.js'));

  console.log('========================================================================');
  console.log('  KOYO Studio / SupDance 前端全工具与全模型可用性深度技术审计');
  console.log('========================================================================\n');

  // 1. Providers Readiness Audit
  const providers = await queryMany('SELECT id, name, enabled, circuit_state FROM ai_studio.ai_providers ORDER BY id');
  const providerAudit = [];
  const readyProviders = new Set();
  for (const p of providers) {
    let key = null;
    try { key = await getServerProviderApiKey({ provider: p.id }); } catch {}
    const hasAdapter = hasProviderAdapter(p.id);
    const isReady = Boolean(p.enabled && key && hasAdapter && p.circuit_state !== 'open');
    if (isReady) readyProviders.add(p.id);
    providerAudit.push({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      circuitState: p.circuit_state,
      hasApiKey: Boolean(key),
      hasAdapter,
      isReady,
    });
  }

  console.log('=== [1] 渠道服务商 (Providers) 就绪情况 ===');
  console.table(providerAudit);
  console.log(`就绪的服务商 (${readyProviders.size}):`, [...readyProviders]);

  // 2. Database Models Full Inventory
  const allDbModels = await queryMany(
    'SELECT id, name, category, status, tier, is_visible, auto_route_eligible FROM ai_studio.ai_models ORDER BY category, id'
  );
  const pricings = await queryMany(
    'SELECT model_id, base_credits, is_active FROM ai_studio.model_pricing WHERE is_active = true'
  );
  const priceMap = new Map(pricings.map(p => [p.model_id, p.base_credits]));

  const routes = await queryMany(
    'SELECT pm.model_id, pm.provider_id, pm.enabled, p.enabled as prov_enabled FROM ai_studio.provider_models pm JOIN ai_studio.ai_providers p ON p.id = pm.provider_id WHERE pm.enabled = true AND p.enabled = true'
  );
  const routeMap = new Map();
  for (const r of routes) {
    if (!routeMap.has(r.model_id)) routeMap.set(r.model_id, []);
    routeMap.get(r.model_id).push(r.provider_id);
  }

  const activeModelsFromService = await listActiveModels();
  const selectableModels = activeModelsFromService.filter(isSelectablePublicModel);
  const selectableIds = new Set(selectableModels.map(m => m.id));

  console.log('\n=== [2] 数据库模型总体准入漏斗 ===');
  console.log(`- 数据库总注册模型数: ${allDbModels.length}`);
  console.log(`- 服务层 listActiveModels() 检出数: ${activeModelsFromService.length}`);
  console.log(`- 公开目录准入 (isSelectablePublicModel) 终极通过数: ${selectableModels.length}`);
  console.log('通过准入上架的 9 个模型:', selectableModels.map(m => `[${m.category}] ${m.id} (${m.name}) - ${m.provider} - ${m.credits_price}算力`));

  // 3. Studio Workbenches Specific Models Audit
  const studioTools = [
    {
      studio: 'ImageStudio (生图工作台)',
      type: 'image',
      defaultModel: 'seedream-5.0',
      referencedModels: [
        'seedream-5.0', 'seedream-4.5', 'gpt-image', 'bytedance-seedream-v3',
        'flux-dev', 'flux-2-klein', 'nano-banana', 'nano-banana-pro', 'wan2.7', 'qwen-image'
      ]
    },
    {
      studio: 'VideoStudio (视频工作台)',
      type: 'video',
      defaultModel: 'kling-2.5',
      referencedModels: [
        'kling-2.5', 'seedance-2.0', 'wan-2.1', 'vidu-2.0', 'kling-2.6',
        'minimax-hailuo-2.3', 'veo-2', 'veo3', 'sora-turbo', 'runway-gen3'
      ]
    },
    {
      studio: 'CinemaStudio (影视工作台)',
      type: 'mixed',
      defaultModel: 'kling-v2.6-pro-t2v (视频) / gpt-image-2.5-flash (图片)',
      referencedModels: [
        'kling-v2.6-pro-t2v', 'minimax-hailuo-2.3-standard-t2v', 'veo3-text-to-video',
        'veo-2-text-to-video', 'seedance-2.5-text-to-video', 'gpt-image-2.5-flash',
        'bytedance-seedream-v3', 'bytedance-seedream-5.0-pro', 'nano-banana-pro'
      ]
    },
    {
      studio: 'AudioStudio (音频/音乐工作台)',
      type: 'audio',
      defaultModel: 'suno-create-music (fallback to audioModels[0])',
      referencedModels: [
        'suno-create-music', 'minimax-speech-2.6', 'minimax-music-3.0',
        'mmaudio-v2-text-to-audio', 'elevenlabs-voice'
      ]
    },
    {
      studio: 'LipSyncStudio (对口型工作台)',
      type: 'lipsync',
      defaultModel: 'infinitetalk-image-to-video',
      referencedModels: [
        'infinitetalk-image-to-video', 'wan2.2-speech-to-video',
        'ltx-2.3-lipsync', 'ltx-2-19b-lipsync'
      ]
    },
    {
      studio: 'RecastStudio (角色重塑工作台)',
      type: 'recast',
      defaultModel: 'kling-v3.0-pro-recast',
      referencedModels: [
        'kling-v3.0-pro-recast', 'runway-act-two-recast', 'wan2.2-animate-recast'
      ]
    },
    {
      studio: 'MotionControlStudio (运镜控制工作台)',
      type: 'motion_control',
      defaultModel: 'seedance-2.5-motion-control',
      referencedModels: [
        'seedance-2.5-motion-control', 'seedance-2-motion-control'
      ]
    },
    {
      studio: 'LayersStudio (图层解构与超分工作台)',
      type: 'layers',
      defaultModel: 'topaz-image-upscale (放大) / nano-banana-pro-edit (编辑)',
      referencedModels: [
        'topaz-image-upscale', 'seedvr2-image-upscale', 'ai-image-upscaler',
        'nano-banana-pro-edit'
      ]
    },
    {
      studio: 'ClippingStudio (智能切片工作台)',
      type: 'clipping',
      defaultModel: 'ai-clipping',
      referencedModels: [
        'ai-clipping', 'sdxl-image', 'chroma-image', 'neta-lumina', 'perfect-pony-xl'
      ]
    },
    {
      studio: 'VibeMotionStudio (动态风格工作台)',
      type: 'vibe_motion',
      defaultModel: '动态从 /api/app/models/available?type=video 获取',
      referencedModels: [
        'kling-2.5', 'seedance-2.0', 'wan-2.1', 'vidu-2.0'
      ]
    },
    {
      studio: 'DrawModal (涂鸦修复弹窗)',
      type: 'modal',
      defaultModel: 'nano-banana-pro-edit',
      referencedModels: [
        'nano-banana-pro-edit', 'nano-banana-2-edit'
      ]
    },
    {
      studio: 'AiInfluencerStudio (虚拟人工作台)',
      type: 'influencer',
      defaultModel: '动态从 /api/models/active 获取',
      referencedModels: [
        'seedream-5.0', 'seedream-4.5', 'gpt-image'
      ]
    },
    {
      studio: 'AgentStudio (智能体对话工作台)',
      type: 'agent',
      defaultModel: 'gpt4o / glm-4 / claude-3-5',
      referencedModels: [
        'gpt-4o', 'claude-3-5-sonnet', 'deepseek-v3', 'qwen-max'
      ]
    }
  ];

  console.log('\n=== [3] 全站工具/工作台 模型可用性盘点 ===');
  const studioReport = [];
  for (const tool of studioTools) {
    const totalRef = tool.referencedModels.length;
    const available = tool.referencedModels.filter(id => selectableIds.has(id));
    const unavailable = tool.referencedModels.filter(id => !selectableIds.has(id));
    
    // Check default model status
    const isDefaultAvailable = selectableIds.has(tool.defaultModel);

    studioReport.push({
      工具工作台: tool.studio,
      默认选中模型: tool.defaultModel,
      默认模型状态: isDefaultAvailable ? '✅ 可用' : '❌ 不可用/未上架',
      可用模型数: `${available.length} / ${totalRef}`,
      可用模型清单: available.join(', ') || '无可用模型 (0)',
      不可用模型清单: unavailable.join(', '),
      业务可用性评价: available.length > 0 && isDefaultAvailable
        ? '🟢 正常可用'
        : available.length > 0
          ? '🟡 部分受限 (默认模型未上架需手动切换)'
          : '🔴 完全不可用 (工作台无任何可用模型)'
    });
  }

  console.table(studioReport);

  // 4. Save detailed report to /tmp/detailed_tools_models_audit.json
  const reportPayload = {
    timestamp: new Date().toISOString(),
    totalDbModels: allDbModels.length,
    selectableCount: selectableModels.length,
    selectableModels: selectableModels.map(m => ({ id: m.id, name: m.name, category: m.category, provider: m.provider, price: m.credits_price })),
    providers: providerAudit,
    studioToolsAudit: studioReport,
  };
  fs.writeFileSync('/tmp/detailed_tools_models_audit.json', JSON.stringify(reportPayload, null, 2));
  console.log('\n详细审计结果已写入 /tmp/detailed_tools_models_audit.json');

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
