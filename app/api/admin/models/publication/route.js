import {withAdminErrorBoundary,requirePermission,okResponse,errorResponse} from '@/lib/admin/authz';
import {PERMISSIONS} from '@/lib/admin/permissions';
import {checkIdempotency,completeIdempotency,releaseIdempotency,getRequiredIdempotencyKey} from '@/lib/admin/idempotency';
import {publicErrorMessage} from '@/lib/security/publicError';
import {inspectModelPublication,prepareModelPublicationTest,quoteModelPublicationTest,submitModelPublicationTest,recordModelPublicationTest,publishModel,readModelPublicationTest} from '@/lib/services/modelPublication';
import {invalidateActiveModelsCache} from '@/app/api/models/active/route';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export const POST=withAdminErrorBoundary(async request=>{
  const body=await request.json().catch(()=>({}));
  const readOnly=['inspect','read_test'].includes(body.action);
  const guard=await requirePermission(request,readOnly ? PERMISSIONS.modelsRead : PERMISSIONS.modelsWrite);
  if(!guard.ok)return guard.response;
  const actions={inspect:inspectModelPublication,prepare_test:prepareModelPublicationTest,quote_test:quoteModelPublicationTest,submit_test:submitModelPublicationTest,record_test:recordModelPublicationTest,publish:publishModel,read_test:readModelPublicationTest};
  if(!actions[body.action] || !body.modelId)return errorResponse('VALIDATION_ERROR','请选择模型及有效操作',422,guard.requestId);
  const key=getRequiredIdempotencyKey(request);
  if(!readOnly && !key)return errorResponse('IDEMPOTENCY_REQUIRED','操作必须携带幂等标识',422,guard.requestId);
  const idem=readOnly ? null : await checkIdempotency({scope:`model_publication:${body.action}`,key,actorId:guard.user.id});
  if(idem && !idem.allowed)return idem.cachedResponse ? okResponse(idem.cachedResponse,guard.requestId) : errorResponse('CONFLICT','操作正在处理',409,guard.requestId);
  try{
    const result=await actions[body.action]({...body,actor:guard.user,idempotencyKey:key,requestId:guard.requestId});
    if(body.action==='publish')invalidateActiveModelsCache();
    if(idem)await completeIdempotency(idem.keyHash,result);
    return okResponse(result,guard.requestId);
  }catch(error){
    if(idem)await releaseIdempotency(idem.keyHash);
    return errorResponse(error.code || 'MODEL_PUBLICATION_FAILED',publicErrorMessage(error,'操作尚未完成，请处理阻塞项'),error.code==='FORBIDDEN' ? 403 : 422,guard.requestId);
  }
});
