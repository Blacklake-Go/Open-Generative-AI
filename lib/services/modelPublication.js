import 'server-only';
import crypto from 'node:crypto';
import {queryOne,queryMany,withTransaction,randomId} from '../db/index.js';
import {logAudit} from '../admin/audit.js';
import {hasPermission,PERMISSIONS} from '../admin/permissions.js';
import {getSettingByKey,updateSettingValue} from '../repositories/settings.js';
import {CANVAS_CAPABILITIES,projectCanvasConfig} from './canvasModelConfig.js';
import {getCanonicalModelById,listProviderModelsByModelId,getModelPricing} from '../repositories/aiCatalog.js';
import {listPublicModelProviderRoutes} from '../repositories/dependencyHealth.js';
import {getServerProviderCredentialStatus} from './providerSecrets.js';
import {hasProviderAdapter} from '../adapters/index.js';
import {assessPublicModelProviderReadiness} from './dependencyHealth.js';
import {projectReadyRouteCapabilities} from '../modelCenter/publicCapabilities.js';
import {publicCanvasModel} from '../canvas/modelDescriptor.js';
import {validateCapabilityParameters} from '../modelCenter/validateCapabilitySchema.js';
import {validateModelPublicationPolicy,modelPublicationPolicy} from '../modelCenter/publicationPolicy.js';
import {calculateModelPrice,createGenerationQuote} from './pricingEngine.js';
import {createGenerationTask} from './generationCore.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const requireWrite=actor=>{if(!hasPermission(actor?.role,PERMISSIONS.modelsWrite))throw fail('FORBIDDEN','没有模型发布权限');};

export async function inspectModelPublication({modelId,parameters=null,transaction=null}) {
  const model=await getCanonicalModelById(modelId,transaction);
  if(!model)throw fail('MODEL_NOT_FOUND','模型不存在');
  const [routes,rows,pricing]=await Promise.all([
    listProviderModelsByModelId(model.id,{transaction}),
    listPublicModelProviderRoutes({includeHidden:true,modelId:model.id,transaction}),
    getModelPricing(model.id,transaction),
  ]);
  const providers=await Promise.all([...new Set(routes.map(route=>route.provider_id))].map(async providerId=>({providerId,...await getServerProviderCredentialStatus({provider:providerId}),adapterAvailable:hasProviderAdapter(providerId)})));
  const configured=new Set(providers.filter(provider=>provider.configured).map(provider=>provider.providerId));
  const adapters=new Set(providers.filter(provider=>provider.adapterAvailable).map(provider=>provider.providerId));
  const readyRows=rows.filter(row=>assessPublicModelProviderReadiness([row],{credentialProviders:configured,adapterProviders:adapters,requiredCategories:[]}).coveredModels===1);
  const descriptor=publicCanvasModel({...model,type:model.category,metadata_json:model.capabilities,credits_price:pricing?.base_credits,generation_capabilities:projectReadyRouteCapabilities(readyRows)},{schemaVersion:2});
  const configurationHash=crypto.createHash('sha256').update(JSON.stringify({capabilityVersion:descriptor.capabilityVersion,pricing:pricing ? {id:pricing.id,type:pricing.pricing_type,credits:pricing.base_credits,formula:pricing.formula_config} : null,routes:routes.map(route=>({id:route.id,mappingVersion:route.mapping_version,endpoint:route.provider_endpoint,providerModelId:route.provider_model_id,priceVersion:route.active_price_version?.id})).sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
    const readMany=transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  const evidenceRows=await readMany(`SELECT t.id,t.creation_id,t.verified_at,t.receipt_json,q.parameters_json FROM ai_studio.model_publication_tests t JOIN ai_studio.creations c ON c.id=t.creation_id JOIN ai_studio.generation_quotes q ON q.id=c.quote_id WHERE t.model_id=$1 AND t.capability_version=$2 AND t.configuration_hash=$3 ORDER BY t.verified_at DESC`,[model.id,descriptor.capabilityVersion,configurationHash]);
  const missingTasks=descriptor.generationCapabilities.map(cap=>cap.taskType).filter(task=>!evidenceRows.some(evidence=>evidence.receipt_json.taskType===task));
  const evidence=evidenceRows[0] || null;
  const checks=[
    {code:'PROVIDER_CREDENTIALS',passed:providers.some(provider=>provider.configured && provider.adapterAvailable),message:'供应商执行凭据与适配器'},
    {code:'REVIEWED_ROUTE',passed:readyRows.length>0,message:'已审核映射、有效成本、健康与配额'},
    {code:'CAPABILITY_SCHEMA',passed:Boolean(descriptor.generationCapabilities.length && descriptor.inputSchema),message:'可验证的能力与参数配置'},
    {code:'SITE_PRICE',passed:Boolean(pricing?.is_active && Number(pricing.base_credits)>0),message:'有效的用户积分售价'},
  ];
  let price=null;
  if(parameters){
    try{validateCapabilityParameters(model.id,descriptor.capabilityVersion,descriptor.inputSchema,parameters);price=await calculateModelPrice({modelId:model.id,parameters,transaction});checks.push({code:'REQUEST_QUOTE',passed:true,message:'所选参数可路由且满足毛利底线'});}
    catch(error){checks.push({code:error.code || 'REQUEST_QUOTE',passed:false,message:error.message});}
  }
  if(!parameters && evidence){
    for(const taskType of new Set(evidenceRows.map(row=>row.receipt_json.taskType))){
      const sample=evidenceRows.find(row=>row.receipt_json.taskType===taskType);
      try{await calculateModelPrice({modelId:model.id,parameters:sample.parameters_json,transaction});checks.push({code:`CURRENT_PRICE_${taskType}`,passed:true,message:`${taskType} 当前汇率与售价满足路由和毛利要求`});}
      catch(error){checks.push({code:`CURRENT_PRICE_${taskType}`,passed:false,message:error.message});}
    }
  }
  checks.push({code:'VERIFIED_TEST',passed:Boolean(evidence) && !missingTasks.length,message:`当前能力和价盘的成功任务、私有结果与积分结算凭据${missingTasks.length ? '；缺少 '+missingTasks.join('、')+' 测试' : ''}`});
  return {model:{id:model.id,name:model.display_name || model.name,status:model.status,policy:modelPublicationPolicy(model)},providers,descriptor,configurationHash,checks,evidence,price,ready:checks.every(check=>check.passed)};
}

export async function prepareModelPublicationTest({actor,modelId,requestId}) {
  requireWrite(actor);
  return withTransaction(async tx=>{
    const before=await tx.queryOne('SELECT status,is_visible,auto_route_eligible FROM ai_studio.ai_models WHERE id=$1 FOR UPDATE',[modelId]);
    if(!before)throw fail('MODEL_NOT_FOUND','模型不存在');
    if(before.is_visible || before.auto_route_eligible)throw fail('MODEL_ALREADY_PUBLIC','已公开模型无需转入隐藏测试阶段');
    await tx.execute("UPDATE ai_studio.ai_models SET status='active',tier='core',updated_at=now() WHERE id=$1",[modelId]);
    await logAudit({actor,action:'model.publication_prepare_test',targetType:'model',targetId:modelId,before,after:{status:'active',isVisible:false},requestId,transaction:tx});
    return {prepared:true};
  });
}

export async function quoteModelPublicationTest({actor,modelId,parameters,idempotencyKey}) {
  requireWrite(actor);
  const report=await inspectModelPublication({modelId,parameters});
  if(report.checks.some(check=>!check.passed && check.code!=='VERIFIED_TEST'))throw fail('MODEL_NOT_TESTABLE','请先处理能力、线路、凭据和价盘阻塞项');
  return createGenerationQuote({userId:actor.id,modelId,parameters,requirePublicAvailability:false,idempotencyKey,
    capabilitySnapshot:{version:report.descriptor.capabilityVersion,schema:report.descriptor.inputSchema,schemaVersion:2,configurationHash:report.configurationHash}});
}

export async function submitModelPublicationTest({actor,modelId,parameters,prompt,quoteId,maxCredits,idempotencyKey}) {
  requireWrite(actor);
  if(!hasPermission(actor.role,PERMISSIONS.generationsWrite))throw fail('FORBIDDEN','没有生成测试权限');
  if(!Number.isSafeInteger(maxCredits) || maxCredits<=0)throw fail('TEST_BUDGET_REQUIRED','必须明确确认本次测试的积分上限');
  const quote=await queryOne('SELECT * FROM ai_studio.generation_quotes WHERE id=$1 AND user_id=$2',[quoteId,actor.id]);
  if(!quote || Number(quote.credits_quoted)>maxCredits)throw fail('TEST_BUDGET_EXCEEDED','测试报价超出已确认的积分上限');
  const report=await inspectModelPublication({modelId,parameters});
  const snapshot=quote.pricing_breakdown_json?.capability;
  if(snapshot?.configurationHash!==report.configurationHash)throw fail('MODEL_CONFIGURATION_CHANGED','配置已改变，请重新检查并报价');
  return createGenerationTask({user:actor,modelId,studioId:'admin_model_test',prompt,parameters,quoteParameters:parameters,quoteId,idempotencyKey,
    expectedCapabilityVersion:report.descriptor.capabilityVersion,requirePublicAvailability:false});
}

export async function recordModelPublicationTest({actor,modelId,creationId,resultReviewed,requestId}) {
  requireWrite(actor);
  if(resultReviewed!==true)throw fail('TEST_REVIEW_REQUIRED','请先查看文本或读取已归档素材，再确认测试结果');
  return withTransaction(async tx=>{
    const report=await inspectModelPublication({modelId,transaction:tx});
    const task=await tx.queryOne(`SELECT c.*,r.status AS funding_status,q.pricing_breakdown_json,q.parameters_json
      FROM ai_studio.creations c JOIN ops_bill.credit_reservations r ON r.id=c.reservation_id
      JOIN ai_studio.generation_quotes q ON q.id=c.quote_id WHERE c.id=$1 AND c.user_id=$2 AND c.model=$3 FOR SHARE OF c,r,q`,[creationId,actor.id,modelId]);
    const capability=task?.pricing_breakdown_json?.capability;
    if(task?.status!=='succeeded' || task.funding_status!=='COMMITTED' || !task.provider_request_id || capability?.version!==report.descriptor.capabilityVersion || capability?.configurationHash!==report.configurationHash)throw fail('TEST_EVIDENCE_INCOMPLETE','任务尚未完成当前配置的上游执行、积分结算或能力绑定');
    if(!task.result_text?.trim()){
      const asset=await tx.queryOne("SELECT id FROM ai_studio.user_assets WHERE id=$1 AND user_id=$2 AND object_key IS NOT NULL AND deleted_at IS NULL AND visibility='private'",[task.asset_id,actor.id]);
      if(task.storage_status!=='ready' || !asset)throw fail('TEST_RESULT_NOT_ARCHIVED','生成结果尚未进入当前账户的私有资产库');
    }
    const taskType=task.parameters_json?.task_type || (report.descriptor.generationCapabilities.length===1 ? report.descriptor.generationCapabilities[0].taskType : null);
    if(!taskType)throw fail('TEST_TASK_TYPE_REQUIRED','测试报价必须绑定明确的任务能力');
    const receipt={taskType,quoteId:task.quote_id,reservationId:task.reservation_id,assetId:task.asset_id || null,provider:task.provider,providerRequestId:task.provider_request_id,credits:task.credit_cost,resultReviewed:true};
    await tx.execute(`INSERT INTO ai_studio.model_publication_tests(id,model_id,creation_id,capability_version,configuration_hash,verified_by,receipt_json)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(creation_id) DO NOTHING`,[`mpt_${randomId()}`,modelId,creationId,report.descriptor.capabilityVersion,report.configurationHash,actor.id,JSON.stringify(receipt)]);
    await logAudit({actor,action:'model.publication_test_verified',targetType:'model',targetId:modelId,after:receipt,requestId,transaction:tx});
    return {verified:true};
  });
}

export async function publishModel({actor,modelId,policy,requestId}) {
  requireWrite(actor);
  if(!validateModelPublicationPolicy(policy))throw fail('MODEL_SCOPE_INVALID','请选择有效站点及用户开放范围');
  return withTransaction(async tx=>{
    const before=await tx.queryOne('SELECT * FROM ai_studio.ai_models WHERE id=$1 FOR UPDATE',[modelId]);
    if(!before)throw fail('MODEL_NOT_FOUND','模型不存在');
    await tx.queryMany('SELECT id FROM ai_studio.provider_models WHERE model_id=$1 FOR SHARE',[modelId]);
    await tx.queryMany('SELECT id FROM ai_studio.model_pricing WHERE model_id=$1 FOR SHARE',[modelId]);
    const report=await inspectModelPublication({modelId,transaction:tx});
    if(!report.ready)throw fail('MODEL_PUBLICATION_BLOCKED','发布检查未通过，请完成所有阻塞项');
    const metadata={...before.capabilities,publicationPolicy:policy,publicationVerifiedCapabilityVersion:report.descriptor.capabilityVersion};
    await tx.execute("UPDATE ai_studio.ai_models SET status='active',tier='core',is_visible=TRUE,auto_route_eligible=TRUE,capabilities=$2::jsonb,updated_at=now() WHERE id=$1",[modelId,JSON.stringify(metadata)]);
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['system-setting:canvas_model_config']);
    const setting=await getSettingByKey('canvas_model_config',tx);
    const config=setting?.value || {mountedModelIds:Object.fromEntries(CANVAS_CAPABILITIES.map(capability=>[capability,[]])),defaults:projectCanvasConfig(null,[]).defaults};
    for(const capability of CANVAS_CAPABILITIES){
      config.mountedModelIds[capability]=(config.mountedModelIds[capability] || []).filter(id=>id!==modelId);
      if(config.defaults[`${capability}ModelId`]===modelId)config.defaults[`${capability}ModelId`]='';
    }
    if(policy.sites.includes('canvas')){
      const capability=report.descriptor.capability;
      config.mountedModelIds[capability].push(modelId);
      if(!config.defaults[`${capability}ModelId`])config.defaults[`${capability}ModelId`]=modelId;
    }
    await updateSettingValue({key:'canvas_model_config',value:config,updatedBy:actor.email,transaction:tx});
    await logAudit({actor,action:'model.publish',targetType:'model',targetId:modelId,riskLevel:'high',before:{status:before.status,isVisible:before.is_visible,autoRouteEligible:before.auto_route_eligible},after:{policy,evidenceId:report.evidence.id,capabilityVersion:report.descriptor.capabilityVersion},requestId,transaction:tx});
    return {published:true,policy,canvasMounted:policy.sites.includes('canvas')};
  });
}

export async function listPublicationModels(){return queryMany('SELECT id,display_name,name,category,status FROM ai_studio.ai_models ORDER BY sort,id');}

export async function readModelPublicationTest({actor,modelId,creationId}) {
  const task=await queryOne('SELECT id,status,result_text,asset_id,error_code,error_reason FROM ai_studio.creations WHERE id=$1 AND user_id=$2 AND model=$3 AND studio_id=$4',[creationId,actor.id,modelId,'admin_model_test']);
  if(!task)throw fail('TEST_NOT_FOUND','当前账户没有该模型测试任务');
  return {id:task.id,status:task.status,text:task.result_text,assetDownloadUrl:task.asset_id ? `/api/assets/${encodeURIComponent(task.asset_id)}/download` : null,errorCode:task.error_code};
}
