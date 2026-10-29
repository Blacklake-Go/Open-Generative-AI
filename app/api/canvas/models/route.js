import { canvasContractVersion } from '@/lib/modelCenter/capabilitySchema';
import { getUserFromRequest } from '@/lib/services/auth';
import { listActiveModels } from '@/lib/services/models';
import { getCanvasAllowedModelIds } from '@/lib/services/canvasModelConfig';
import { isCanvasServerCapabilityEnabled } from '@/lib/canvas/capabilityPolicy';
import { publicCanvasModel, canvasCatalogVersion } from '@/lib/canvas/modelDescriptor';
import { canvasJson, canvasOriginGuard, canvasPreflight } from '@/lib/canvas/http';

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
    const [models, allowed] = await Promise.all([
      listActiveModels(),
      getCanvasAllowedModelIds({ userId: user.id }),
    ]);
    const published = models.map(model => publicCanvasModel(model, {schemaVersion}))
      .filter((model) => isCanvasServerCapabilityEnabled(model.capability) && allowed.has(model.id) && model.available);
    return canvasJson(request, { schemaVersion, catalogVersion: canvasCatalogVersion(published), models: published });
  } catch (error) {
    if (error.code === 'MODEL_CATALOG_VERSION_UNSUPPORTED') return canvasJson(request,{error:error.message,code:error.code},{status:409});
    console.error('[api/canvas/models]', { code: error?.code || 'MODEL_CATALOG_FAILED' });
    return canvasJson(request, { error: '读取模型目录失败', code: 'MODEL_CATALOG_FAILED' }, { status: 503 });
  }
}
