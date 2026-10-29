import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIAdapter } from '../lib/adapters/OpenAIAdapter.js';

test('reviewed OpenAI mappings send text, speech and images through their declared protocol',async()=>{
  const previous=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});
    if (url.endsWith('/chat/completions')) return Response.json({id:'chat-fixture',choices:[{message:{content:'fixture text'}}]});
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([73,68,51,0]),{headers:{'content-type':'audio/mpeg','x-request-id':'speech-fixture'}});
    return Response.json({data:[{b64_json:'aW1hZ2U='}]});
  };
  try {
    const adapter=new OpenAIAdapter({apiKey:'isolated-test-value'});
    const text=await adapter.createTask({providerModelId:'reviewed-chat',prompt:'text',parameters:{task_type:'t2t',messages:[{role:'user',content:'text'}],max_completion_tokens:12}});
    assert.equal(text.resultText,'fixture text');
    assert.equal(calls[0].body.max_completion_tokens,12);
    assert.equal(calls[0].body.stream,false);
    const speech=await adapter.createTask({providerModelId:'reviewed-voice',prompt:'speech',parameters:{task_type:'t2a',voice:'alloy',speed:1,response_format:'mp3'}});
    assert.equal(speech.resultUrl,'data:audio/mpeg;base64,SUQzAA==');
    assert.equal(speech.providerRequestId,'speech-fixture');
    assert.equal(calls[1].body.input,'speech');
    assert.equal(calls[1].body.prompt,undefined);
    const image=await adapter.createTask({providerModelId:'reviewed-image',prompt:'image',parameters:{task_type:'t2i',resolution:'1024x1024'}});
    assert.equal(image.resultUrl,'data:image/png;base64,aW1hZ2U=');
    assert.equal(calls[2].body.messages,undefined);
    await assert.rejects(adapter.createTask({providerModelId:'unsupported',parameters:{task_type:'t2m'}}),{code:'INVALID_INPUT'});
    assert.equal(calls.length,3);
  } finally {globalThis.fetch=previous;}
});

test('rejected requests do not turn correlation IDs into accepted task receipts',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({error:{message:'input rejected'}},{status:400,headers:{'x-request-id':'request-correlation-only'}});
  try {
    await assert.rejects(new OpenAIAdapter({apiKey:'isolated-test-value'}).createTask({providerModelId:'fixture',prompt:'fixture'}),error=>error.providerStatus===400 && !error.providerRequestId);
  }finally{globalThis.fetch=previous;}
});
