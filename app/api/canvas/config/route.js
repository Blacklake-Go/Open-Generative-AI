import { canvasContractVersion } from '@/lib/modelCenter/capabilitySchema';
import { getUserFromRequest } from '@/lib/services/auth';
import { CANVAS_CAPABILITIES, getCanvasAllowedModelIds, getCanvasModelConfig, listCanvasModelCandidates, projectCanvasConfig } from '@/lib/services/canvasModelConfig';
import { canvasJson, canvasOriginGuard, canvasPreflight } from '@/lib/canvas/http';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, OPTIONS');
}

export async function GET(request) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const schemaVersion = canvasContractVersion(request);
    const config = await getCanvasModelConfig();
    const [candidates, allowedModelIds] = await Promise.all([
      config ? listCanvasModelCandidates() : [],
      getCanvasAllowedModelIds({ userId: user.id }),
    ]);
    const projected = projectCanvasConfig(config, candidates);
    for (const capability of projected.mountedModelIds ? CANVAS_CAPABILITIES : []) {
      projected.mountedModelIds[capability] = projected.mountedModelIds[capability].filter((id) => allowedModelIds.has(id));
      const defaultKey = `${capability}ModelId`;
      if (!allowedModelIds.has(projected.defaults[defaultKey])) projected.defaults[defaultKey] = '';
    }
    projected.configured = Object.values(projected.mountedModelIds || {}).some((ids) => ids.length > 0);
    return canvasJson(request, schemaVersion === 1 && projected.mountedModelIds ? projectCanvasConfig(projected,candidates,{schemaVersion:1}) : projected);
  } catch (error) {
    if (error.code === 'MODEL_CATALOG_VERSION_UNSUPPORTED') return canvasJson(request,{error:publicErrorMessage(error),code:error.code},{status:409});
    console.error('[api/canvas/config]', error);
    return canvasJson(request, { error: '画布配置暂时不可用' }, { status: 503 });
  }
}

