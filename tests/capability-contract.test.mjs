import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReadyRouteCapabilities } from '../lib/modelCenter/publicCapabilities.js';
import { buildPublicParameterSchema, canvasContractVersion, isProviderConfigurationParameter } from '../lib/modelCenter/capabilitySchema.js';
import { validateCapabilityParameters } from '../lib/modelCenter/validateCapabilitySchema.js';
import { publicCanvasModel } from '../lib/canvas/modelDescriptor.js';
import { projectCanvasConfig } from '../lib/services/canvasModelConfig.js';

function route(task, output, extra = {}) {
  return { supported_task_types:[task], mapping_capabilities:{input_types:['text'],output_types:[output],parameters:['prompt','temperature','max_tokens'],...extra} };
}

test('reviewed text, speech and music routes have explicit, distinct capability contracts', () => {
  const capabilities = projectReadyRouteCapabilities([route('chat','text'),route('text_to_speech','audio'),route('text_to_music','audio')]);
  assert.deepEqual(capabilities.map(item => item.taskType),['t2t','t2a','t2m']);
  assert.deepEqual(capabilities[0].outputTypes,['text']);
  assert.ok(capabilities.every(item => item.variants.length===1));
});

test('parameter contracts retain route combinations and validate JSON Schema without coercing values', () => {
  const routes = ['720p','1080p'].map((resolution,index) => ({supported_task_types:['t2v'],supported_resolutions:[resolution],
    mapping_capabilities:{input_types:['text'],output_types:['video'],parameters:['resolution','aspect_ratio','temperature'],
      aspect_ratios:[index?'9:16':'16:9'],input_schema:{type:'object',properties:{temperature:{type:'number',minimum:0,maximum:1}},required:['resolution','aspect_ratio']}}}));
  const schema = buildPublicParameterSchema(projectReadyRouteCapabilities(routes));
  validateCapabilityParameters('fixture','v1',schema,{resolution:'720p',aspect_ratio:'16:9',temperature:0.5});
  assert.throws(() => validateCapabilityParameters('fixture','v1',schema,{resolution:'720p',aspect_ratio:'9:16'}),{code:'MODEL_PARAMETERS_INVALID'});
  assert.throws(() => validateCapabilityParameters('fixture','v1',schema,{resolution:'720p',aspect_ratio:'16:9',temperature:'0.5'}),{code:'MODEL_PARAMETERS_INVALID'});
  assert.throws(() => validateCapabilityParameters('fixture','v1',schema,{resolution:'720p',aspect_ratio:'16:9',temperature:2}),{code:'MODEL_PARAMETERS_INVALID'});
});

test('public parameters allow token budgets and descriptions but never provider, billing or credential configuration', () => {
  for (const key of ['max_tokens','max_output_tokens','max_completion_tokens','description']) assert.equal(isProviderConfigurationParameter(key),false);
  for (const key of ['api_key','providerModelId','baseUrl','access_token','script','SCRIPT','billing_price','credits','creditCost','cost_usd','quoted_credits']) assert.equal(isProviderConfigurationParameter(key),true,key);
  const schema = buildPublicParameterSchema(projectReadyRouteCapabilities([route('chat','text',{
    parameters:['prompt','messages','max_tokens','description','api_key','credits'],
  })]));
  assert.equal(schema.properties.max_tokens.type,'integer');
  assert.equal(schema.properties.api_key,undefined);
  assert.equal(schema.properties.credits,undefined);
});

test('v2 music mounts separate from speech while v1 keeps its compatible audio view', () => {
  const model={id:'music-fixture',name:'Fixture',type:'audio',metadata_json:{sub_type:'music'},generation_capabilities:projectReadyRouteCapabilities([route('text_to_music','audio')])};
  assert.equal(publicCanvasModel(model).capability,'audio');
  assert.equal(publicCanvasModel(model,{schemaVersion:2}).capability,'music');
  const config={mountedModelIds:{image:[],video:[],text:[],audio:['music-fixture','speech-fixture']},defaults:{audioModelId:'music-fixture'}};
  const candidates=[{id:'music-fixture',capability:'music'},{id:'speech-fixture',capability:'audio'}];
  const v2=projectCanvasConfig(config,candidates);
  assert.deepEqual(v2.mountedModelIds.audio,['speech-fixture']);
  assert.deepEqual(v2.mountedModelIds.music,['music-fixture']);
  assert.equal(v2.defaults.musicModelId,'music-fixture');
  // 旧配置的 audio 默认指向音乐模型，拆分后 audio 组需要落在仍挂载的语音模型上，否则该组没有合法默认值。
  assert.equal(v2.defaults.audioModelId,'speech-fixture');
  const v1=projectCanvasConfig(config,candidates,{schemaVersion:1});
  assert.deepEqual(v1.mountedModelIds.audio,['speech-fixture','music-fixture']);
  assert.equal(v1.defaults.audioModelId,'music-fixture');
  assert.equal(v1.mountedModelIds.music,undefined);
});

test('catalogue contract versions are negotiated explicitly and unknown versions fail closed', () => {
  assert.equal(canvasContractVersion(new Request('https://www.supdance.com/api/canvas/models')),1);
  assert.equal(canvasContractVersion(new Request('https://www.supdance.com/api/canvas/models?schemaVersion=2')),2);
  assert.throws(() => canvasContractVersion(new Request('https://www.supdance.com/api/canvas/models?schemaVersion=3')),{code:'MODEL_CATALOG_VERSION_UNSUPPORTED'});
});
