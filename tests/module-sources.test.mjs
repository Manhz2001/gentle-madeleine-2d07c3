import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseLlm} from '@google/adk';
import {MODULES,MLCT_INDEX_URL,allowedModuleFetchUrl,interactionSourcesFromRows,compatibilitySourcesFromRows,mlctSourcesFromRows,getModuleSources,resetModuleCacheForTests} from '../nbcare-server/module-sources.mjs';
import {chat} from '../nbcare-server/runtime.mjs';

// Fictional medicine labels and schedules only; all HTTP/AI calls are mocked.
const cell=value=>({value});
const pair=(a='FixtureAlpha',b='FixtureBeta',reference='Tài liệu mô phỏng 2024')=>({STT:cell('7'),'Thuốc 1':cell(a),'Thuốc 2':cell(b),'Mức độ':cell('Mức mô phỏng'),'Cơ chế':cell('Cơ chế này chỉ là nội dung kiểm thử phần mềm, không dùng điều trị.'),'Hậu quả':cell('Kết quả mô phỏng để kiểm tra ánh xạ nguồn.'),'Xử trí':cell('Chỉ dành cho kiểm thử.'),'Nguồn':cell(reference)});
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const moduleResult=sources=>({sources,moduleKind:'interactions',coverageComplete:true,citationComplete:true,sufficient:true});
const env={GEMINI_API_KEY:'offline-placeholder-only',NBCARE_VERTEX_ENABLED:'true'};
class OfflineModel extends BaseLlm{constructor(){super({model:'offline-only'});}async *generateContentAsync(){throw new Error('No real AI calls in tests');}async connect(){throw new Error('Disabled');}}

test('module fetches are restricted to fixed endpoints and exact static asset paths',()=>{
  for(const url of [MODULES.interactions.api,MODULES.compatibility.api,MLCT_INDEX_URL,'https://gentle-madeleine-2d07c3.netlify.app/data/mlct-drugs/drug-0001.json'])assert.equal(allowedModuleFetchUrl(url),true,url);
  for(const url of [MODULES.interactions.api+'?patient=private','https://example.com/patient','http://127.0.0.1/private','https://gentle-madeleine-2d07c3.netlify.app/data/mlct-drugs/../../secret','https://gentle-madeleine-2d07c3.netlify.app/data/mlct-drugs/drug-0001.json?private=1'])assert.equal(allowedModuleFetchUrl(url),false,url);
});

test('interaction lookup requires both exact source medicine names and does not infer safety from a missing pair',()=>{
  const rows=[pair(),pair('FixtureAlpha','FixtureGamma')];
  const exact=interactionSourcesFromRows(rows,'FixtureBeta + FixtureAlpha có tương tác không?');
  assert.equal(exact.sources.length,1);assert.equal(exact.coverageComplete,true);
  assert.match(exact.sources[0].url,new RegExp(MODULES.interactions.sheetId));
  assert.match(exact.sources[0].section,/STT 7/);assert.equal(exact.sources[0].sourceRow,null);
  assert.equal(exact.sources[0].year,2024);
  for(const query of ['FixtureAlpha với UnknownMedicine','FixtureAlphaBeta với FixtureBeta','FixtureAlpha'])assert.equal(interactionSourcesFromRows(rows,query).sources.length,0,query);
  const missingPair=interactionSourcesFromRows(rows,'FixtureBeta + FixtureGamma');
  assert.equal(missingPair.sources.length,0);assert.equal(missingPair.coverageComplete,false);
});

test('multiple medicines retain only matching pairs and disclose incomplete pair coverage',()=>{
  const result=interactionSourcesFromRows([pair(),pair('FixtureAlpha','FixtureGamma')],'FixtureAlpha, FixtureBeta, FixtureGamma');
  assert.equal(result.sources.length,2);assert.equal(result.coverageComplete,false);
});

test('a year is never fabricated from a decision number, fetch date or conflicting reference years',()=>{
  for(const reference of ['Quyết định 5948/BYT','UpToDate','Tài liệu mô phỏng 2021; phiên bản 2024']){
    const source=interactionSourcesFromRows([pair('FixtureAlpha','FixtureBeta',reference)],'FixtureAlpha + FixtureBeta').sources[0];
    assert.equal(source.year,undefined);assert.equal(source.usableForIntervention,false);
  }
});

test('compatibility sources preserve raw API labels without pharmacological severity or a fabricated legend',()=>{
  const result=compatibilitySourcesFromRows([{drug1:'FixtureAlpha',drug2:'FixtureBeta',status:'C'}],'FixtureAlpha + FixtureBeta pha chung?');
  assert.equal(result.sources.length,1);
  const source=result.sources[0];assert.equal(source.moduleKind,'compatibility');assert.equal(source.rawStatus,'C');
  assert.equal(source.legendVerified,false);assert.equal(source.usableForIntervention,false);assert.equal(source.year,undefined);
  assert.match(source.excerpt,/giữ nguyên, không tự diễn giải: C/);
  assert.doesNotMatch(source.excerpt,/không có tương tác|an toàn|chống chỉ định/i);
});

test('MLCT split threshold records retain one complete original sheet row and a real row locator',()=>{
  const full='CrCl > 51: LỊCH_A; CrCl ≤ 51: LỊCH_B — dữ liệu mô phỏng, không điều trị.';
  const record={HoatChat:'FixtureAlpha',RowNumber:23,ChiDinh:'Tình huống mô phỏng',DuongDung:'Đường mô phỏng',LieuTheoMLCT:full,LieuTheoMLCTDongDayDu:'CrCl > 51: LỊCH_A',Nguon:'UpToDate'};
  const sources=mlctSourcesFromRows([record,{...record,LieuTheoMLCTDongDayDu:'CrCl ≤ 51: LỊCH_B'}],'FixtureAlpha',{snapshotGeneratedAt:'2026-01-01'});
  assert.equal(sources.length,1);assert.match(sources[0].excerpt,/CrCl > 51: LỊCH_A; CrCl ≤ 51: LỊCH_B/);
  assert.equal(sources[0].sourceRow,23);assert.match(sources[0].url,/#gid=1879897713&range=A23:K23/);
  assert.equal(sources[0].year,undefined);assert.equal(sources[0].snapshotGeneratedAt,'2026-01-01');
});

test('fixed module HTTP reads are cached and never transmit a patient narrative',async()=>{
  resetModuleCacheForTests();const urls=[];
  const options={intent:'interactions',fetchImpl:async(url,request)=>{urls.push(url);assert.equal(request.method,'GET');assert.equal(request.body,undefined);return json([pair()]);}};
  const result=await getModuleSources('FixtureAlpha + FixtureBeta; PRIVATE_PATIENT_SENTINEL',options);
  await getModuleSources('FixtureAlpha + FixtureBeta',options);
  assert.deepEqual(urls,[MODULES.interactions.api]);assert.equal(result.sufficient,true);
});

test('untrusted redirects and oversized module bodies fail closed',async()=>{
  for(const fetchImpl of [async()=>new Response(null,{status:302,headers:{location:'https://example.com/exfil'}}),async()=>new Response('[]',{headers:{'content-length':String(13*1024*1024)}})]){
    resetModuleCacheForTests();const result=await getModuleSources('FixtureAlpha + FixtureBeta',{intent:'interactions',fetchImpl});
    assert.equal(result.unavailable,true);assert.deepEqual(result.sources,[]);assert.equal(result.sufficient,false);
  }
});

test('aborted, disabled, hepatic-only and ordinary concept lookups never start network calls',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw new Error('Unexpected call');};
  for(const [query,options] of [['FixtureAlpha',{enabled:false,intent:'interactions'}],['Liều FixtureAlpha ở suy gan Child-Pugh C',{intent:'special_dose'}],['eGFR là gì?',{intent:'other'}],['Xin chào',{intent:'other'}]]){
    const result=await getModuleSources(query,{...options,fetchImpl});assert.equal(result.sources.length,0,query);
  }
  await assert.rejects(getModuleSources('FixtureAlpha + FixtureBeta',{intent:'interactions',signal:AbortSignal.abort(),fetchImpl}));
  assert.equal(calls,0);
});

test('MLCT static index provenance and exact drug-file identity are checked before accepting rows',async()=>{
  resetModuleCacheForTests();const urls=[];
  const index={source:MODULES.mlct.api,drugNames:['FixtureAlpha'],drugFiles:{FixtureAlpha:'data/mlct-drugs/drug-0001.json'},generatedAt:'2026-01-01'};
  const fetchImpl=async url=>{urls.push(url);return json(url===MLCT_INDEX_URL?index:{name:'FixtureAlpha',rows:[{HoatChat:'FixtureAlpha',RowNumber:2,LieuTheoMLCT:'LỊCH_MÔ_PHỎNG dài để kiểm thử; không áp dụng cho điều trị.',Nguon:'Tài liệu mô phỏng 2024'}]});};
  const result=await getModuleSources('Hiệu chỉnh liều FixtureAlpha với CrCl 31',{intent:'special_dose',fetchImpl});
  assert.equal(result.sources.length,1);assert.equal(result.sufficient,true);
  assert.deepEqual(urls,[MLCT_INDEX_URL,'https://gentle-madeleine-2d07c3.netlify.app/data/mlct-drugs/drug-0001.json']);
  resetModuleCacheForTests();index.source='https://example.com/unrelated';
  const rejected=await getModuleSources('Hiệu chỉnh liều FixtureAlpha',{fetchImpl});assert.deepEqual(rejected.sources,[]);
});

test('renal dose intent takes priority over an incidental compatibility phrase',async()=>{
  resetModuleCacheForTests();const urls=[];
  const result=await getModuleSources('Hiệu chỉnh liều FixtureAlpha khi CrCl 31, đồng thời hỏi tương hợp',{intent:'special_dose',fetchImpl:async url=>{urls.push(url);return json({source:MODULES.mlct.api,drugNames:[],drugFiles:{}});}});
  assert.equal(result.moduleKind,'mlct');assert.deepEqual(urls,[MLCT_INDEX_URL]);
});

async function workflow({mode='open',moduleSourceLoader,sourceLoader=async()=>[],openSourceLoader=async()=>[],queries=['FixtureAlpha + FixtureBeta']}={}){
  const consulted=[];
  const response=await chat({message:'Kiểm tra tương tác FixtureAlpha và FixtureBeta',sourceMode:mode,answerStyle:'basic'},
    {env,moduleSourceLoader,sourceLoader,openSourceLoader,modelFactory:()=>new OfflineModel(),draftVerifier:async data=>data,agentRunner:async agent=>{
      for(const query of queries){const result=await agent.tools[0].execute({query,drug_names:['FixtureAlpha','FixtureBeta']});consulted.push(result);}
      return {text:'{}'};
    }});
  return {response,consulted};
}

test('runtime checks the module before catalogue and never starts external fallback when module evidence is sufficient',async()=>{
  const order=[],sources=interactionSourcesFromRows([pair()],'FixtureAlpha + FixtureBeta').sources;
  const {consulted}=await workflow({moduleSourceLoader:async()=>{order.push('module');return moduleResult(sources);},sourceLoader:async()=>{order.push('catalogue');return [];},openSourceLoader:async()=>{order.push('external');return [];}});
  assert.equal(order[0],'module');assert.ok(order.includes('catalogue'));assert.equal(order.includes('external'),false);
  assert.equal(consulted[0].sources[0].provenance,'published_drugview_module');assert.equal(consulted[0].moduleLookup.sufficient,true);
});

test('open mode falls back only after an incomplete module lookup while retaining module-first ordering',async()=>{
  const order=[],sources=interactionSourcesFromRows([pair('FixtureAlpha','FixtureBeta','Quyết định 5948/BYT')],'FixtureAlpha + FixtureBeta').sources;
  const external={id:'external_fixture',title:'Nguồn mô phỏng',url:'https://moh.gov.vn/mock',excerpt:'Đoạn mô phỏng cho kiểm thử phần mềm, không dùng điều trị.',year:2024,section:'Mô phỏng',origin:'open'};
  const {consulted}=await workflow({moduleSourceLoader:async()=>{order.push('module');return {...moduleResult(sources),citationComplete:false,sufficient:false};},openSourceLoader:async()=>{order.push('external');return [external];}});
  assert.ok(order.indexOf('external')>order.lastIndexOf('module'));
  assert.equal(consulted[0].sources[0].moduleKind,'interactions');assert.equal(consulted[0].sources.at(-1).id,'external_fixture');
});

test('closed mode never calls outside references even when a matching sheet row has no citation year',async()=>{
  const sources=interactionSourcesFromRows([pair('FixtureAlpha','FixtureBeta','Quyết định 5948/BYT')],'FixtureAlpha + FixtureBeta').sources;let external=0;
  const {response}=await workflow({mode:'closed',moduleSourceLoader:async()=>({...moduleResult(sources),sufficient:false,citationComplete:false}),openSourceLoader:async()=>{external++;return [];}});
  assert.equal(external,0);assert.equal(response.grounded,false);assert.match(response.text,/Chưa đủ dữ liệu/);
});

test('a changed tool query cannot reuse an initial module pair matching only one of the medicines',async()=>{
  const sources=interactionSourcesFromRows([pair()],'FixtureAlpha + FixtureBeta').sources;let calls=0;
  const {consulted}=await workflow({mode:'closed',moduleSourceLoader:async()=>++calls===1?moduleResult(sources):{sources:[],moduleKind:'interactions',sufficient:false},queries:['FixtureAlpha + UnknownMedicine']});
  assert.deepEqual(consulted[0].sources,[]);
});

test('numerous incomplete module rows leave room for official fallback passages',async()=>{
  const base=interactionSourcesFromRows([pair()],'FixtureAlpha + FixtureBeta').sources[0];
  const sources=Array.from({length:12},(_,i)=>({...base,id:'module_fixture_'+i}));
  const external={...base,id:'external_fixture',origin:'open',sourceType:'us_spl',moduleKind:undefined,url:'https://dailymed.nlm.nih.gov/mock'};
  const {consulted}=await workflow({moduleSourceLoader:async()=>({...moduleResult(sources),sufficient:false}),openSourceLoader:async()=>[external]});
  assert.ok(consulted[0].sources.some(source=>source.id==='external_fixture'));
});
