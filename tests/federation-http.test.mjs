import test from 'node:test';
import assert from 'node:assert/strict';
import { federationMutationGuard,readFederationBody } from '../lib/federation/http.js';

const make=(origin,body='{}')=>new Request('https://one.supdance.com/api/federation/link/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
test('federation mutations restrict starts to ONE and assertions to the exact main origin',()=>{
 assert.equal(federationMutationGuard(make('https://one.supdance.com')),null);
 assert.equal(federationMutationGuard(make('https://www.supdance.com'),{fromMain:true}),null);
 for(const origin of ['https://evil.example','https://www.supdance.com.evil.example','http://www.supdance.com','https://canvas.supdance.com']){
  assert.equal(federationMutationGuard(make(origin),{fromMain:true}).status,403);
 }
 assert.equal(federationMutationGuard(make('https://www.supdance.com')).status,403);
});
test('actual streamed JSON and form bytes are bounded without trusting Content-Length',async()=>{
 assert.deepEqual(await readFederationBody(make('https://one.supdance.com','{"password":"owned"}')),{password:'owned'});
 await assert.rejects(()=>readFederationBody(make('https://one.supdance.com','[]')),{code:'FEDERATION_REQUEST_INVALID'});
 const oversized=new Request('https://one.supdance.com/',{method:'POST',headers:{'Content-Type':'application/json'},duplex:'half',body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(16385));controller.close();}})});
 assert.equal(oversized.headers.get('content-length'),null);
 await assert.rejects(()=>readFederationBody(oversized),{code:'FEDERATION_BODY_TOO_LARGE'});
 const form=new Request('https://one.supdance.com/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'assertion=SD1.signed.proof'});
 assert.equal((await readFederationBody(form,{form:true})).get('assertion'),'SD1.signed.proof');
});
