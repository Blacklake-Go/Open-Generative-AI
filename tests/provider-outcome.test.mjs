import test from 'node:test';
import assert from 'node:assert/strict';
import { isSubmissionOutcomeUnconfirmed as unknown } from '../lib/services/providerOutcome.js';
import { pollGenerationTask } from '../lib/services/generationCore.js';
import { DeepSeekAdapter } from '../lib/adapters/DeepSeekAdapter.js';
import { OpenAIAdapter } from '../lib/adapters/OpenAIAdapter.js';

test('submission ambiguity stops retries unless there is a definite rejection or terminal result', () => {
  for (const error of [{code:'NETWORK_ERROR'}, {code:'TIMEOUT'}, {providerStatus:503}, {providerStatus:409}, {}]) {
    assert.equal(unknown(error, {callStarted:true}), true);
    assert.equal(unknown(error, {callStarted:false}), false);
    assert.equal(unknown(error, {callStarted:true,terminalFailure:true}), false);
  }
  for (const status of [400,401,402,403,404,422,429]) {
    assert.equal(unknown({providerStatus:status}, {callStarted:true}), false);
    assert.equal(unknown({providerStatus:status}, {callStarted:true,providerRequestId:'accepted'}), true);
  }
});

function pollingFixture({ageMinutes = 1, result, error} = {}) {
  const creation = {id:'poll-test',user_id:'owner',status:'processing',provider:'fixture',model:'fixture',provider_request_id:'accepted',reservation_id:'held',started_at:new Date(Date.now()-ageMinutes*60000).toISOString()};
  const events = [], schedules = [];
  let providerReads = 0;
  return {creation,events,schedules,get providerReads(){return providerReads;},deps:{
    findCreationById:async()=>creation,
    claimDuePollingCreation:async()=>creation,
    // Polling first consults the durable checkpoint and its attempt. Neither
    // exists in this fixture, so both reads must be stubbed instead of falling
    // through to the real database.
    getGenerationResult:async()=>null,
    getGenerationAttemptForReceipt:async()=>null,
    getProviderAdapter:async()=>({getTask:async()=>{providerReads++;if(error)throw error;return result;},normalizeError:e=>e}),
    withTransaction:async cb=>cb({}),
    voidCredits:async()=>assert.fail('uncertain upstream status must keep the reservation'),
    commitCredits:async()=>assert.fail('unconfirmed result cannot settle'),
    updateGenerationOutcome:async()=>assert.fail('unconfirmed result cannot become terminal'),
    addGenerationEvent:async(_creation,type)=>events.push(type),
    scheduleNextPoll:async(_id,options)=>schedules.push(options),
  }};
}

test('polling deadline performs one final read and pauses without refunding or failing',async()=>{
  const f=pollingFixture({ageMinutes:31,result:{status:'processing'}});
  const result=await pollGenerationTask({creationId:f.creation.id,testDependencies:f.deps});
  assert.equal(f.providerReads,1);
  assert.equal(result.status,'processing');
  assert.equal(result.reconciliationRequired,true);
  assert.deepEqual(f.events,['TASK_RECONCILIATION_REQUIRED','PROVIDER_POLL_PAUSED']);
  assert.equal(f.schedules[0].nextPollAt,null);
});

test('query authentication failure cannot be treated as a failed generation',async()=>{
  const f=pollingFixture({error:{code:'AUTH_ERROR',message:'query not authorized'}});
  const result=await pollGenerationTask({creationId:f.creation.id,testDependencies:f.deps});
  assert.equal(result.reconciliationRequired,true);
  assert.equal(f.creation.status,'processing');
});

test('transient query errors retry read-only until the polling deadline',async()=>{
  for (const ageMinutes of [1,31]) {
    const f=pollingFixture({ageMinutes,error:{code:'TIMEOUT'}});
    const result=await pollGenerationTask({creationId:f.creation.id,testDependencies:f.deps});
    assert.equal(f.providerReads,1);
    assert.equal(result.status,'processing');
    assert.equal(f.schedules[0].nextPollAt===null,ageMinutes===31);
  }
});

test('synchronous chat adapters cannot invent a recovered success',async()=>{
  for (const Adapter of [DeepSeekAdapter,OpenAIAdapter]) {
    const result=await new Adapter().getTask('lost-response');
    assert.equal(result.status,'processing');
    assert.equal(result.reconciliationRequired,true);
  }
});
