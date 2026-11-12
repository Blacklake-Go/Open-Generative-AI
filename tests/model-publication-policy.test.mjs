import test from 'node:test';
import assert from 'node:assert/strict';
import {modelPublicationPolicy,isModelPublishedToSite,isModelAudienceAllowed,validateModelPublicationPolicy} from '../lib/modelCenter/publicationPolicy.js';

test('publication scopes remain explicit and legacy models retain their existing sites',()=>{
  assert.deepEqual(modelPublicationPolicy({}).sites,['main','canvas']);
  const model={metadata_json:{publicationPolicy:{sites:['canvas'],audience:'allowlist',userIds:['123456']}}};
  assert.equal(isModelPublishedToSite(model,'main'),false);
  assert.equal(isModelPublishedToSite(model,'canvas'),true);
  assert.equal(isModelAudienceAllowed(model,{userId:'123456'}),true);
  assert.equal(isModelAudienceAllowed(model,{userId:'654321',isPaid:true}),false);
  const paid={capabilities:{publicationPolicy:{sites:['main'],audience:'paid',userIds:[]}}};
  assert.equal(isModelAudienceAllowed(paid,{userId:'123456',isPaid:false}),false);
  assert.equal(isModelAudienceAllowed(paid,{userId:'123456',isPaid:true}),true);
  for(const policy of [{sites:[],audience:'all',userIds:[]},{sites:['main'],audience:'allowlist',userIds:[]},{sites:['other'],audience:'all',userIds:[]}])assert.equal(validateModelPublicationPolicy(policy),false);
  assert.equal(validateModelPublicationPolicy(model.metadata_json.publicationPolicy),true);
});
