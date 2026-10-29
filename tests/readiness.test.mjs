import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReadiness,resetReadinessForTests} from '../nbcare-server/readiness.mjs';
import {createHandler} from '../netlify/functions/nbcare-api.mjs';
import {runtimeStatus} from '../nbcare-server/runtime.mjs';

// Offline connectivity fixtures only. No real credential, patient text,
// network, browser or model request is used by this test suite.
const env={GEMINI_API_KEY:'offline-readiness-fixture-only',GEMINI_MODEL:'gemini-3.8-flash',NBCARE_VERTEX_ENABLED:'true'};
const start=1800000000000,readyMs=5*60*1000,failureMs=10000;
const readyResponse=()=>({candidates:[{content:{parts:[{text:'Internal thought is ignored.',thought:true},{text:'READY'}]}}]});
const noClient=()=>{throw new Error('A cached/unconfigured readiness check must not construct a client');};
const clientFor=generateContent=>()=>({models:{generateContent}});
const readyClient=clientFor(async()=>readyResponse());
const event=(changes={})=>({httpMethod:'GET',path:'/api/readiness',headers:{'x-nf-client-connection-ip':'readiness-http'},...changes});

test('readiness: absent or disabled configuration cannot appear ready and never constructs an SDK client',async()=>{
  for(const config of [{},{GEMINI_API_KEY:'   '},{...env,NBCARE_VERTEX_ENABLED:'false'},{GEMINI_API_KEY:env.GEMINI_API_KEY,GEMINI_ENABLED:'false'}]){
    resetReadinessForTests();
    const result=await checkReadiness({env:config,now:start,clientFactory:noClient});
    assert.equal(result.ready,false);assert.equal(result.verifiedAt,null);assert.equal(result.expiresAt,start+failureMs);
    assert.doesNotMatch(JSON.stringify(result),/offline-readiness-fixture-only|API_KEY/);
  }
});

test('readiness: only a real fixed probe response yields the ready state and completion timestamp',async()=>{
  resetReadinessForTests();let clock=start,seenOptions,seenRequest;
  const result=await checkReadiness({env,now:()=>clock,clientFactory:options=>{seenOptions=options;return {models:{generateContent:async request=>{
    seenRequest=request;clock+=123;return readyResponse();
  }}};}});
  assert.equal(result.ready,true);assert.equal(result.verifiedAt,start+123);assert.equal(result.expiresAt,start+123+readyMs);
  assert.equal(result.model,env.GEMINI_MODEL);assert.equal(seenOptions.vertexai,true);assert.equal(seenOptions.httpOptions.apiVersion,'v1');
  assert.equal(seenOptions.apiKey,env.GEMINI_API_KEY);assert.equal(seenRequest.model,env.GEMINI_MODEL);
  assert.ok(seenRequest.config.abortSignal instanceof AbortSignal);assert.ok(seenRequest.config.maxOutputTokens<=256);
  const payload=JSON.stringify(seenRequest.contents);
  assert.match(payload,/READY/);assert.ok(payload.length<500);
  assert.doesNotMatch(payload,/bệnh nhân|patient|diagnosis|prescription|medical|offline-readiness-fixture-only/i);
  assert.doesNotMatch(JSON.stringify(result),/offline-readiness-fixture-only|apiKey|tag|Internal thought/);
});

test('readiness: empty, malformed, thought-only or nonexact READY responses never become green',async()=>{
  const invalid=[null,undefined,{}, {text:''},{text:'NOT READY'},{text:'READY but not verified'},{text:'ready'},
    {candidates:[]},{candidates:[{content:{parts:[]}}]},
    {candidates:[{content:{parts:{text:'READY'}}}]},
    {candidates:[{content:{parts:[{text:123}]}}]},
    {text:'READY',candidates:[{content:{parts:[{text:'READY',thought:true}]}}]},
    {candidates:[{content:{parts:[{text:'READY',thought:true},{text:'NOT READY'}]}}]},
  ];
  for(const response of invalid){
    resetReadinessForTests();
    const result=await checkReadiness({env,now:start,clientFactory:clientFor(async()=>response)});
    assert.equal(result.ready,false);assert.equal(result.verifiedAt,null);assert.equal(result.expiresAt,start+failureMs);
  }
});

test('readiness: a successful response may be split across non-thought text parts without leaking thought text',async()=>{
  resetReadinessForTests();
  const result=await checkReadiness({env,now:start,clientFactory:clientFor(async()=>({candidates:[{content:{parts:[{text:'NOT READY',thought:true},{text:'RE'},{text:'ADY'}]}}]}))});
  assert.equal(result.ready,true);assert.doesNotMatch(JSON.stringify(result),/NOT READY/);
});

test('readiness: SDK construction errors and provider errors fail closed without exposing upstream details',async()=>{
  for(const factory of [()=>{throw new Error('SDK failed: offline-readiness-fixture-only');},clientFor(async()=>{throw new Error('PRIVATE_PROVIDER_ERROR offline-readiness-fixture-only');})]){
    resetReadinessForTests();
    const result=await checkReadiness({env,now:start,clientFactory:factory});
    assert.equal(result.ready,false);assert.equal(result.verifiedAt,null);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_ERROR|offline-readiness-fixture-only|stack|apiKey|tag/);
  }
});

test('readiness: a successful check is cached for exactly five minutes without a repeated billable probe',async()=>{
  resetReadinessForTests();let calls=0;
  const factory=clientFor(async()=>{calls++;return readyResponse();});
  const first=await checkReadiness({env,now:start,clientFactory:factory});
  const cached=await checkReadiness({env:{...env},now:start+readyMs-1,clientFactory:noClient});
  assert.deepEqual(cached,first);assert.equal(calls,1);
  const refreshed=await checkReadiness({env,now:start+readyMs,clientFactory:factory});
  assert.equal(calls,2);assert.equal(refreshed.ready,true);assert.equal(refreshed.verifiedAt,start+readyMs);
});

test('readiness: a failed check is retried after ten seconds and never reuses a previous green state',async()=>{
  resetReadinessForTests();let calls=0;
  const failure=clientFor(async()=>{calls++;throw new Error('Offline provider failure');});
  const first=await checkReadiness({env,now:start,clientFactory:failure});
  assert.equal(first.ready,false);
  const cached=await checkReadiness({env,now:start+failureMs-1,clientFactory:noClient});
  assert.deepEqual(cached,first);assert.equal(calls,1);
  const retried=await checkReadiness({env,now:start+failureMs,clientFactory:clientFor(async()=>{calls++;return readyResponse();})});
  assert.equal(calls,2);assert.equal(retried.ready,true);assert.equal(retried.verifiedAt,start+failureMs);
});

test('readiness: changing the key or model invalidates a cached ready result',async()=>{
  resetReadinessForTests();let calls=0;
  const factory=clientFor(async()=>{calls++;return readyResponse();});
  await checkReadiness({env,now:start,clientFactory:factory});
  await checkReadiness({env:{...env,GEMINI_API_KEY:'another-offline-fixture'},now:start+1,clientFactory:factory});
  const changedModel=await checkReadiness({env:{...env,GEMINI_API_KEY:'another-offline-fixture',GEMINI_MODEL:'gemini-other-fixture'},now:start+2,clientFactory:factory});
  assert.equal(calls,3);assert.equal(changedModel.model,'gemini-other-fixture');
});

test('readiness: disabling a configured service takes precedence over a cached successful probe',async()=>{
  resetReadinessForTests();await checkReadiness({env,now:start,clientFactory:readyClient});
  const disabled=await checkReadiness({env:{...env,NBCARE_VERTEX_ENABLED:'false'},now:start+1,clientFactory:noClient});
  assert.equal(disabled.ready,false);assert.equal(disabled.verifiedAt,null);
});

test('readiness: an invalid model override is sanitized before the fixed probe',async()=>{
  resetReadinessForTests();let model;
  const result=await checkReadiness({env:{...env,GEMINI_MODEL:'https://attacker.example/model'},now:start,clientFactory:clientFor(async request=>{model=request.model;return readyResponse();})});
  assert.equal(model,'gemini-3.8-flash');assert.equal(result.model,'gemini-3.8-flash');assert.equal(result.ready,true);
});

test('readiness: concurrent identical checks share one in-flight probe',async()=>{
  resetReadinessForTests();let calls=0,resolve;
  const pending=new Promise(done=>{resolve=done;});
  const factory=clientFor(()=>{calls++;return pending;});
  const first=checkReadiness({env,now:start,clientFactory:factory}),second=checkReadiness({env:{...env},now:start,clientFactory:factory});
  await new Promise(done=>setImmediate(done));assert.equal(calls,1);resolve(readyResponse());
  const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.equal(a.ready,true);
});

test('readiness: a concurrent request for another model does not inherit an unrelated in-flight result',async()=>{
  resetReadinessForTests();let finishFirst,calls=0;
  const pending=new Promise(done=>{finishFirst=done;});
  const first=checkReadiness({env,now:start,clientFactory:clientFor(()=>{calls++;return pending;})});
  const secondEnv={...env,GEMINI_MODEL:'gemini-second-fixture'};
  const second=await checkReadiness({env:secondEnv,now:start+1,clientFactory:clientFor(async()=>{calls++;return readyResponse();})});
  assert.equal(second.ready,true);assert.equal(second.model,secondEnv.GEMINI_MODEL);finishFirst(readyResponse());await first;
  const stillSecond=await checkReadiness({env:secondEnv,now:start+2,clientFactory:noClient});
  assert.deepEqual(stillSecond,second);assert.equal(calls,2);
});

test('readiness: an already aborted request never constructs a provider client',async()=>{
  resetReadinessForTests();const controller=new AbortController();controller.abort();
  const result=await checkReadiness({env,now:start,signal:controller.signal,clientFactory:noClient});
  assert.equal(result.ready,false);assert.equal(result.verifiedAt,null);
});

test('readiness: abort bounds a provider that ignores its abort signal and a late result cannot turn it green',{timeout:1000},async()=>{
  resetReadinessForTests();const controller=new AbortController();let complete;
  const provider=new Promise(done=>{complete=done;});
  const pending=checkReadiness({env,now:start,signal:controller.signal,clientFactory:clientFor(()=>provider)});
  setImmediate(()=>controller.abort());const result=await pending;
  assert.equal(result.ready,false);assert.equal(result.verifiedAt,null);
  complete(readyResponse());await new Promise(done=>setImmediate(done));
  const stillFailed=await checkReadiness({env,now:start+1,clientFactory:noClient});
  assert.equal(stillFailed.ready,false);assert.deepEqual(stillFailed,result);
});

test('readiness HTTP: configuration status does not itself claim verified connectivity',async()=>{
  const handler=createHandler({env,api:{runtimeStatus}});
  const response=await handler(event({path:'/api/status'})),data=JSON.parse(response.body);
  assert.equal(response.statusCode,200);assert.equal(data.configured,true);assert.equal(data.connectionVerified,false);
  assert.notEqual(data.ready,true);assert.doesNotMatch(response.body,/offline-readiness-fixture-only/);
});

test('readiness HTTP: GET and Netlify rewrite return only the readiness result with no patient input',async()=>{
  let received;
  const expected={ready:true,verifiedAt:start,expiresAt:start+readyMs,model:env.GEMINI_MODEL};
  const handler=createHandler({env,readiness:async options=>{received=options;return expected;}});
  const response=await handler(event({path:'/.netlify/functions/nbcare-api',queryStringParameters:{action:'readiness',message:'PRIVATE_PATIENT_FIXTURE'},body:'PRIVATE_PATIENT_BODY'}));
  assert.equal(response.statusCode,200);assert.equal(response.headers['Cache-Control'],'no-store');assert.deepEqual(JSON.parse(response.body),expected);
  assert.equal(received.env,env);assert.ok(received.signal instanceof AbortSignal);
  assert.deepEqual(Object.keys(received).sort(),['env','signal']);
  assert.doesNotMatch(response.body,/PRIVATE_PATIENT|offline-readiness-fixture-only/);
});

test('readiness HTTP: a denied origin or wrong method cannot initiate a billable probe',async()=>{
  const handler=createHandler({env,readiness:noClient});
  const denied=await handler(event({headers:{origin:'https://attacker.example'}}));
  assert.equal(denied.statusCode,403);assert.equal(JSON.parse(denied.body).error.code,'ORIGIN_NOT_ALLOWED');
  assert.equal(denied.headers['Access-Control-Allow-Origin'],undefined);
  for(const method of ['POST','HEAD','DELETE']){
    const response=await handler(event({httpMethod:method}));assert.equal(response.statusCode,405);
  }
});
