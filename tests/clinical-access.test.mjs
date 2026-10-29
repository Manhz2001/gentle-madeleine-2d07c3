import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {pinDigest,issueAccessToken,verifyAccessToken,unlockClinicalAccess,accessStatus,resetAccessAttemptsForTests} from '../nbcare-server/clinical-access.mjs';
import {createHandler} from '../netlify/functions/nbcare-api.mjs';
import {chat,runtimeStatus,WARNING} from '../nbcare-server/runtime.mjs';

// Offline fixtures only; neither the real access code nor a real API key is read.
const env={GEMINI_API_KEY:'offline-test-secret',NBCARE_CLINICAL_PIN:'2468',NBCARE_VERTEX_ENABLED:'true'};
const now=1800000000000,duration=30*60*1000;
const noCall=()=>{throw new Error('A protected/public-referral request must not reach sources or models');};
const event=(pin,changes={})=>({httpMethod:'POST',path:'/api/access',headers:{'content-type':'application/json','x-nf-client-connection-ip':'access-fixture'},body:JSON.stringify({pin}),...changes});
const body=response=>JSON.parse(response.body);
const signPayload=value=>{
  const encoded=Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature=createHmac('sha256',env.GEMINI_API_KEY).update('nbcare-clinical-session-v1\0'+encoded).digest('base64url');
  return encoded+'.'+signature;
};

test('access: a correct offline code yields a signed 30-minute token without exposing code or API key',()=>{
  resetAccessAttemptsForTests();
  const issued=unlockClinicalAccess({pin:env.NBCARE_CLINICAL_PIN},{env,now,ip:'valid-fixture'});
  assert.equal(issued.expiresAt,now+duration);assert.equal(verifyAccessToken(issued.accessToken,{env,now}),true);
  const payload=JSON.parse(Buffer.from(issued.accessToken.split('.')[0],'base64url').toString('utf8'));
  assert.equal(payload.scope,'clinical-deep');assert.equal(payload.exp-payload.iat,duration);
  assert.match(payload.nonce,/^[a-f0-9]{32}$/);
  assert.doesNotMatch(JSON.stringify(issued),/offline-test-secret|2468|pinDigest|GEMINI_API_KEY/);
  assert.doesNotMatch(JSON.stringify(payload),/offline-test-secret|2468|pinDigest|GEMINI_API_KEY/);
});

test('access: separately issued sessions have distinct nonces and remain individually valid',()=>{
  const first=issueAccessToken({env,now}),second=issueAccessToken({env,now});
  assert.notEqual(first.accessToken,second.accessToken);
  assert.equal(verifyAccessToken(first.accessToken,{env,now}),true);
  assert.equal(verifyAccessToken(second.accessToken,{env,now}),true);
});

test('access: token expiry is enforced at the exact boundary',()=>{
  const issued=issueAccessToken({env,now});
  assert.equal(verifyAccessToken(issued.accessToken,{env,now:issued.expiresAt-1}),true);
  assert.equal(verifyAccessToken(issued.accessToken,{env,now:issued.expiresAt}),false);
  assert.equal(verifyAccessToken(issued.accessToken,{env,now:issued.expiresAt+1}),false);
});

test('access: a changed signing key, body or signature cannot validate a token',()=>{
  const issued=issueAccessToken({env,now}),parts=issued.accessToken.split('.');
  assert.equal(verifyAccessToken(issued.accessToken,{env:{...env,GEMINI_API_KEY:'different-offline-secret'},now}),false);
  assert.equal(verifyAccessToken(parts[0]+'x.'+parts[1],{env,now}),false);
  const changed=parts[1].slice(0,-1)+(parts[1].endsWith('A')?'B':'A');
  assert.equal(verifyAccessToken(parts[0]+'.'+changed,{env,now}),false);
});

test('access: malformed, oversized and absent tokens fail closed',()=>{
  for(const value of [null,undefined,{},42,'','not-a-token','one.two.three','x'.repeat(801),'.',' '+issueAccessToken({env,now}).accessToken]){
    assert.equal(verifyAccessToken(value,{env,now}),false);
  }
  assert.equal(verifyAccessToken(issueAccessToken({env,now}).accessToken,{env:{},now}),false);
});

test('access: even correctly signed malformed session claims are refused',()=>{
  const valid={scope:'clinical-deep',iat:now,exp:now+duration,nonce:'a'.repeat(32)};
  for(const changed of [
    {scope:'all'}, {iat:now+5001,exp:now+5001+duration}, {exp:now+duration+1},
    {iat:'1800000000000'}, {exp:null}, {nonce:'short'}, {nonce:'z'.repeat(32)},
  ])assert.equal(verifyAccessToken(signPayload({...valid,...changed}),{env,now}),false);
  assert.equal(verifyAccessToken(signPayload(valid),{env,now}),true);
});

test('access: invalid code input never returns a token or credential',()=>{
  for(const [index,payload] of [null,{},[],{pin:2468},{pin:'abcd'},{pin:'0000'},{pin:'2468 '}].entries()){
    resetAccessAttemptsForTests();
    assert.throws(()=>unlockClinicalAccess(payload,{env,now,ip:'invalid-'+index}),error=>{
      assert.equal(error.status,403);assert.equal(error.code,'CLINICAL_ACCESS_INVALID');
      assert.equal(error.accessToken,undefined);assert.doesNotMatch(error.message,/offline-test-secret|2468/);return true;
    });
  }
});

test('access: five failures lock one address for ten minutes, including a later correct code',()=>{
  resetAccessAttemptsForTests();const ip='locked-fixture';
  for(let i=0;i<5;i++)assert.throws(()=>unlockClinicalAccess({pin:'0000'},{env,now,ip}),error=>error.status===403);
  for(const pin of ['0000',env.NBCARE_CLINICAL_PIN])assert.throws(()=>unlockClinicalAccess({pin},{env,now:now+1,ip}),error=>error.status===429&&error.code==='CLINICAL_ACCESS_RATE_LIMITED');
  assert.throws(()=>unlockClinicalAccess({pin:env.NBCARE_CLINICAL_PIN},{env,now:now+10*60*1000-1,ip}),error=>error.status===429);
  const issued=unlockClinicalAccess({pin:env.NBCARE_CLINICAL_PIN},{env,now:now+10*60*1000,ip});
  assert.equal(verifyAccessToken(issued.accessToken,{env,now:now+10*60*1000}),true);
});

test('access: the attempt limit is isolated by address and a successful unlock resets failures',()=>{
  resetAccessAttemptsForTests();
  for(let i=0;i<5;i++)assert.throws(()=>unlockClinicalAccess({pin:'0000'},{env,now,ip:'address-a'}));
  assert.ok(unlockClinicalAccess({pin:env.NBCARE_CLINICAL_PIN},{env,now,ip:'address-b'}).accessToken);
  for(let i=0;i<4;i++)assert.throws(()=>unlockClinicalAccess({pin:'0000'},{env,now,ip:'address-c'}));
  assert.ok(unlockClinicalAccess({pin:env.NBCARE_CLINICAL_PIN},{env,now,ip:'address-c'}).accessToken);
  for(let i=0;i<5;i++)assert.throws(()=>unlockClinicalAccess({pin:'0000'},{env,now,ip:'address-c'}),error=>error.status===403);
});

test('access: a missing server signing credential returns configuration failure',()=>{
  assert.throws(()=>issueAccessToken({env:{},now}),error=>error.status===503&&error.code==='NOT_CONFIGURED');
  assert.throws(()=>unlockClinicalAccess({pin:env.NBCARE_CLINICAL_PIN},{env:{},now}),error=>error.status===503&&error.code==='NOT_CONFIGURED');
});

test('access: configured HMAC verification works without storing a cleartext code',()=>{
  const hmac=pinDigest(env.NBCARE_CLINICAL_PIN,env),hmacEnv={GEMINI_API_KEY:env.GEMINI_API_KEY,NBCARE_CLINICAL_PIN_HMAC:hmac};
  resetAccessAttemptsForTests();
  const issued=unlockClinicalAccess({pin:env.NBCARE_CLINICAL_PIN},{env:hmacEnv,now,ip:'hmac-fixture'});
  assert.equal(verifyAccessToken(issued.accessToken,{env:hmacEnv,now}),true);
  assert.notEqual(hmac,env.NBCARE_CLINICAL_PIN);assert.notEqual(hmac,pinDigest(env.NBCARE_CLINICAL_PIN,{GEMINI_API_KEY:'another-secret'}));
});

test('access: public status exposes access policy without exposing code, digest or API key',()=>{
  assert.deepEqual(accessStatus(),{deepRequiresCode:true,sessionMinutes:30});
  const status=JSON.stringify(runtimeStatus(env));
  assert.doesNotMatch(status,/2468|offline-test-secret|pinDigest|CLINICAL_PIN|API_KEY/);
});

test('access: HTTP access route accepts JSON and the Netlify rewrite without invoking clinical APIs',async()=>{
  resetAccessAttemptsForTests();
  const handler=createHandler({env,api:{chat:noCall,ocr:noCall,runtimeStatus:noCall}});
  const response=await handler(event(env.NBCARE_CLINICAL_PIN,{path:'/.netlify/functions/nbcare-api',queryStringParameters:{action:'access'},headers:{'content-type':'application/json','x-nf-client-connection-ip':'http-valid'}}));
  assert.equal(response.statusCode,200);assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(verifyAccessToken(body(response).accessToken,{env}),true);
  assert.doesNotMatch(response.body,/2468|offline-test-secret|pinDigest/);
});

test('access: bad origins are rejected before code evaluation and cannot exhaust the valid-address attempt count',async()=>{
  resetAccessAttemptsForTests();const ip='http-origin-test';
  const handler=createHandler({env,api:{chat:noCall,ocr:noCall}});
  for(let i=0;i<6;i++){
    const response=await handler(event('0000',{headers:{origin:'https://attacker.example','content-type':'application/json','x-nf-client-connection-ip':ip}}));
    assert.equal(response.statusCode,403);assert.equal(body(response).error.code,'ORIGIN_NOT_ALLOWED');
    assert.equal(response.headers['Access-Control-Allow-Origin'],undefined);
  }
  const response=await handler(event(env.NBCARE_CLINICAL_PIN,{headers:{origin:'https://gentle-madeleine-2d07c3.netlify.app','content-type':'application/json','x-nf-client-connection-ip':ip}}));
  assert.equal(response.statusCode,200);assert.ok(body(response).accessToken);
});

test('access: HTTP code failures and rate limiting return sanitized errors without credentials',async()=>{
  resetAccessAttemptsForTests();const ip='http-wrong-code';
  const handler=createHandler({env,api:{chat:noCall,ocr:noCall}});
  for(let i=0;i<6;i++){
    const response=await handler(event('0000',{headers:{'content-type':'application/json','x-nf-client-connection-ip':ip}}));
    assert.equal(response.statusCode,i<5?403:429);
    assert.equal(body(response).accessToken,undefined);
    assert.doesNotMatch(response.body,/2468|offline-test-secret|pinDigest|accessToken/);
  }
  const unavailable=await createHandler({env:{},api:{chat:noCall,ocr:noCall}})(event(env.NBCARE_CLINICAL_PIN,{headers:{'content-type':'application/json','x-nf-client-connection-ip':'http-missing-config'}}));
  assert.equal(unavailable.statusCode,503);assert.equal(body(unavailable).accessToken,undefined);
});

test('access: HTTP malformed input and wrong methods are rejected before any code is issued',async()=>{
  const handler=createHandler({env,api:{chat:noCall,ocr:noCall}});
  for(const [changes,status] of [[{httpMethod:'GET'},405],[{headers:{'content-type':'text/plain'}},415],[{body:'{invalid'},422]]){
    const response=await handler(event(env.NBCARE_CLINICAL_PIN,changes));
    assert.equal(response.statusCode,status);assert.equal(body(response).accessToken,undefined);
  }
});

const protectedPayload={message:'Meropenem là thuốc gì?',sourceMode:'closed',answerStyle:'deep',history:[]};
const noClinicalOptions={env,sourceLoader:noCall,openSourceLoader:noCall,modelFactory:noCall,agentRunner:noCall,draftVerifier:noCall};

test('workflow: deep mode without a valid access token is blocked before sources or a model are invoked',async()=>{
  for(const accessToken of [undefined,'invalid-session-token',issueAccessToken({env,now:Date.now()-duration-1}).accessToken]){
    await assert.rejects(()=>chat({...protectedPayload,...(accessToken?{accessToken}:{})},noClinicalOptions),error=>error.status===403&&error.code==='CLINICAL_ACCESS_REQUIRED');
  }
});

test('workflow: a valid deep token permits source lookup without requiring a model call when sources are empty',async()=>{
  const issued=issueAccessToken({env});let reads=0;
  const result=await chat({...protectedPayload,accessToken:issued.accessToken},{...noClinicalOptions,sourceLoader:async()=>{reads++;return [];}});
  assert.equal(reads,1);assert.equal(result.grounded,false);assert.equal(result.sources.length,0);
});

test('workflow: a public whole-prescription review is referred before source or model access',async()=>{
  const result=await chat({message:'Hãy thẩm định toàn bộ đơn thuốc này.',sourceMode:'open',answerStyle:'basic',history:[]},noClinicalOptions);
  assert.match(result.text,/Chuyên sâu|nội bộ/);assert.match(result.text,/mã truy cập|đăng nhập/);
  assert.equal(result.grounded,false);assert.deepEqual(result.sources,[]);
});

test('workflow: a complete OCR prescription also requires internal access before any clinical lookup',async()=>{
  const ocrText='ĐƠN THUỐC\nHọ tên: Người bệnh giả lập. Chẩn đoán: Kiểm thử.\n1. Meropenem 1 g: truyền 3 lần/ngày.\n2. Valproate 500 mg: uống 2 lần/ngày.';
  const result=await chat({message:'Hai thuốc này có tương tác không?',ocrText,sourceMode:'open',answerStyle:'basic',history:[]},noClinicalOptions);
  assert.match(result.text,/Chuyên sâu|nội bộ/);assert.equal(result.grounded,false);assert.deepEqual(result.sources,[]);
});

test('workflow: current emergency symptoms receive immediate help guidance before prescription routing',async()=>{
  const result=await chat({message:'Bệnh nhân đang khó thở và đau ngực; hãy thẩm định đơn thuốc này.',sourceMode:'closed',answerStyle:'basic',history:[]},noClinicalOptions);
  assert.ok(result.text.includes(WARNING));assert.match(result.text,/khẩn cấp|cấp cứu/);assert.deepEqual(result.sources,[]);
});
