import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseLlm} from '@google/adk';
import {sourceMetadata,wholeQuote,validateEvidence,renderClinicalReport,draftCandidates,applyDraftVerdict,MISSING} from '../nbcare-server/prescription-review.mjs';
import {chat,loadApproved,modelOf,runtimeStatus,DEFAULT_MODEL,DEFAULT_DEEP_MODEL} from '../nbcare-server/runtime.mjs';
import {verifyDraft,restoreCompletePassages} from '../nbcare-server/verify-draft.mjs';
import {issueAccessToken} from '../nbcare-server/clinical-access.mjs';

// Offline fixtures only: no real patient records, network calls or credentials.
const quote='Không sử dụng meropenem khi người bệnh có tiền sử quá mẫn nghiêm trọng với thành phần của thuốc.';
const source={id:'approved_meropenem',title:'Tài liệu bệnh viện — meropenem',documentTitle:'Tờ hướng dẫn meropenem',
  url:'https://moh.gov.vn/reference/meropenem',excerpt:quote,year:2024,section:'Chống chỉ định',tags:['meropenem'],
  usableForIntervention:true,provenance:'approved_local'};
const recordMap=(value=source)=>new Map([[value.id,value]]);
const evidence=(value=source)=>[{source_id:value.id,quote:value.excerpt}];
const finding=(value=source)=>({severity:'yellow',issue:'Cần đối chiếu tiền sử dị ứng',mechanism:'Tài liệu có giới hạn liên quan đến quá mẫn.',action:'Đề nghị bác sĩ đối chiếu tiền sử dị ứng.',monitoring:'',evidence:evidence(value)});
const information=(value=source)=>({section:'contraindications',text:'Tài liệu ghi chống chỉ định khi có tiền sử quá mẫn nghiêm trọng với thành phần thuốc.',evidence:evidence(value)});
const payload={message:'Thông tin meropenem',sourceMode:'closed',answerStyle:'basic',history:[]};
const env={GEMINI_API_KEY:'offline-placeholder-only',NBCARE_VERTEX_ENABLED:'true'};
class OfflineModel extends BaseLlm {
  constructor(model='gemini-offline'){super({model});}
  async *generateContentAsync(){throw new Error('A unit test must not call a model');}
  async connect(){throw new Error('No live audio in unit tests');}
}

test('citation metadata never substitutes today or fabricates a year/page',()=>{
  const m=sourceMetadata({...source,year:undefined,section:undefined,page:undefined});
  assert.equal(m.year,null);assert.equal(m.section,'');assert.equal(m.page,'');assert.equal(m.complete,false);
  assert.equal(sourceMetadata({...source,year:'2024; page 7'}).complete,false);
  const result=renderClinicalReport({information:[information({...source,year:undefined})]},recordMap({...source,year:undefined}));
  assert.match(result.text,/chưa có năm trong nguồn/);assert.doesNotMatch(result.text,/trang [0-9]+/);
});

test('internal review preserves module provenance for verification and refuses unverified compatibility-code interventions',()=>{
  const moduleSource={...source,moduleKind:'compatibility',legendVerified:false,provenance:'published_drugview_module'};
  const candidates=draftCandidates({information:[information(moduleSource)],findings:[finding(moduleSource)]},recordMap(moduleSource));
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].key,'information');
  assert.equal(candidates[0].sources[0].moduleKind,'compatibility');
  assert.equal(candidates[0].sources[0].legendVerified,false);
  assert.equal(candidates[0].sources[0].provenance,'published_drugview_module');
  assert.equal(validateEvidence(evidence(moduleSource),recordMap(moduleSource),{clinical:true}),null);
  const report=renderClinicalReport({findings:[finding(moduleSource)]},recordMap(moduleSource));
  assert.equal(report.grounded,false);
  assert.doesNotMatch(report.text,/LƯU Ý MỨC ĐỘ 2/);
});

test('a real document year plus verified section or page can support a clinical citation',()=>{
  assert.equal(sourceMetadata(source).complete,true);
  assert.equal(sourceMetadata({...source,section:'',page:'12'}).complete,true);
  assert.equal(sourceMetadata({...source,section:'',page:''}).complete,false);
});

test('missing metadata, abstract-only and explicit reference-only sources cannot support warnings or interventions',()=>{
  for(const changed of [{year:undefined},{section:'',page:''},{usableForIntervention:false},{evidenceLevel:'abstract_only'}]){
    const value={...source,...changed};
    const report=renderClinicalReport({findings:[finding(value)],recommendations:[{issue:'meropenem',proposal:'Đề nghị đổi thuốc.',monitoring:'',evidence:evidence(value)}]},recordMap(value));
    assert.doesNotMatch(report.text,/LƯU Ý MỨC ĐỘ 2|Đề nghị đổi thuốc/);
    assert.ok(report.text.includes(MISSING));assert.equal(report.grounded,false);
  }
});

test('whole evidence retains a negation and its complete conditions',()=>{
  assert.equal(wholeQuote(quote,quote),true);
  assert.equal(wholeQuote(quote,quote.replace(/^Không /,'')),false);
  assert.equal(wholeQuote(quote,'sử dụng meropenem khi người bệnh có tiền sử quá mẫn nghiêm trọng'),false);
});

test('a colon cannot detach a criterion from its leading contraindication or condition',()=>{
  const excerpt='Không sử dụng trong các trường hợp sau: người bệnh có tiền sử quá mẫn nghiêm trọng với thuốc.';
  assert.equal(wholeQuote(excerpt,'người bệnh có tiền sử quá mẫn nghiêm trọng với thuốc.'),false);
});

test('a semicolon cannot strip an exception from a clinical sentence',()=>{
  const excerpt='Không sử dụng thuốc này cho người bệnh; trừ khi bác sĩ chuyên khoa đã đánh giá đầy đủ và theo dõi.';
  assert.equal(wholeQuote(excerpt,'Không sử dụng thuốc này cho người bệnh;'),false);
  assert.equal(wholeQuote(excerpt,excerpt),true);
});

test('evidence requires a consulted source ID and an exact complete quote',()=>{
  assert.equal(validateEvidence([{source_id:'invented',quote}],recordMap()),null);
  assert.equal(validateEvidence([{source_id:source.id,quote:quote+' Một câu không có trong nguồn.'}],recordMap()),null);
  assert.equal(validateEvidence([],recordMap()),null);
  assert.equal(validateEvidence(evidence(),recordMap(),{clinical:true})[0].id,source.id);
});

test('clinical findings with unknown source IDs are excluded from the report',()=>{
  const item=finding();item.evidence[0].source_id='unconsulted_reference';
  const report=renderClinicalReport({findings:[item]},recordMap());
  assert.doesNotMatch(report.text,/LƯU Ý MỨC ĐỘ 2/);assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);
});

test('verification candidates retain the full source passage and exclude unconsulted claims',()=>{
  const invalid={...information(),evidence:[{source_id:'invented',quote}]};
  const candidates=draftCandidates({information:[information(),invalid],findings:[finding()]},recordMap());
  assert.deepEqual(candidates.map(c=>c.id),['information_0','findings_0']);
  for(const candidate of candidates)assert.equal(candidate.sources[0].excerpt,quote);
});

test('abstract-only records may be reference candidates but never intervention candidates',()=>{
  const value={...source,evidenceLevel:'abstract_only',usableForIntervention:false};
  const candidates=draftCandidates({information:[information(value)],findings:[finding(value)],
    recommendations:[{issue:'meropenem',proposal:'Đề nghị đổi thuốc.',evidence:evidence(value)}]},recordMap(value));
  assert.deepEqual(candidates.map(c=>c.id),['information_0']);
});

test('a verifier can accept only candidate IDs, never create a new finding or citation',()=>{
  const data={overview:'Thông tin do người dùng cung cấp.',information:[information()],findings:[finding()]};
  const candidates=draftCandidates(data,recordMap());
  const checked=applyDraftVerdict(data,candidates,{overview_supported:true,accepted_item_ids:['information_0','recommendations_999','invented']});
  assert.equal(checked.overview,data.overview);assert.deepEqual(checked.information,data.information);
  assert.deepEqual(checked.findings,[]);assert.deepEqual(checked.recommendations,[]);
});

test('absent or invalid verification drops medical findings and unsupported patient overview',()=>{
  const data={overview:'Một tóm tắt chưa được xác minh.',information:[information()],findings:[finding()]};
  const checked=applyDraftVerdict(data,draftCandidates(data,recordMap()),{});
  assert.deepEqual(checked.information,[]);assert.deepEqual(checked.findings,[]);
  assert.notEqual(checked.overview,data.overview);
});

test('green cannot be inferred from a model flag when no patient/order context was provided',()=>{
  const item={...finding(),severity:'green',issue:'Đơn thuốc phù hợp hoàn toàn'};
  const report=renderClinicalReport({reviewComplete:true,missingData:[],findings:[item]},recordMap(),{input:''});
  assert.doesNotMatch(report.text,/🟢|Đơn thuốc phù hợp hoàn toàn/);
});

test('green is excluded when the model admits missing renal/patient data',()=>{
  const item={...finding(),severity:'green',issue:'Đơn thuốc phù hợp hoàn toàn'};
  const report=renderClinicalReport({reviewComplete:true,missingData:['Chưa có chức năng thận.'],findings:[item]},recordMap());
  assert.doesNotMatch(report.text,/🟢|Đơn thuốc phù hợp hoàn toàn/);
});

test('US SPL provenance remains explicit in the visible answer, rather than becoming a Vietnamese SPC',()=>{
  const value={...source,origin:'open',sourceType:'us_spl',provenance:'official_dailymed',title:'DailyMed SPL — meropenem',documentTitle:'DailyMed SPL — meropenem',
    url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=11111111-1111-1111-1111-111111111111',
    limitations:'Nhãn SPL của Hoa Kỳ; không đồng nhất với tờ hướng dẫn được duyệt tại Việt Nam.'};
  const report=renderClinicalReport({information:[information(value)]},recordMap(value),{mode:'open'});
  assert.match(report.text,/Hoa Kỳ/);assert.match(report.text,/Việt Nam/);
});

test('all three Markdown protocol blocks and the exact missing-data statement are present without evidence',()=>{
  const report=renderClinicalReport({},new Map());
  assert.match(report.text,/### 1\. TÓM TẮT ĐƠN THUỐC/);
  assert.match(report.text,/### 2\. PHÂN TÍCH LÂM SÀNG/);
  assert.match(report.text,/### 3\. ĐỀ XUẤT CAN THIỆP DƯỢC LÂM SÀNG/);
  assert.ok(report.text.includes(MISSING));assert.equal(report.answered,false);assert.equal(report.grounded,false);
});

test('the complete rendered answer remains under 600 words even when overview and missing fields are oversized',()=>{
  const report=renderClinicalReport({overview:'a '.repeat(350).trim(),missingData:Array(6).fill('b '.repeat(80).trim())},new Map());
  assert.ok(report.text.split(/\s+/).filter(Boolean).length<=600);
});

test('whole-block pruning does not leave phantom sources or grounded status for removed evidence',()=>{
  const report=renderClinicalReport({overview:'a '.repeat(350).trim(),missingData:Array(2).fill('b '.repeat(80).trim()),
    information:[{text:'c '.repeat(350).trim(),evidence:evidence()}]},recordMap());
  for(const value of report.sources)assert.ok(report.text.includes(value.url),'Every returned source must remain cited in visible answer');
  if(!report.sources.length)assert.equal(report.grounded,false);
});

test('approved records retain verified citation metadata when loaded by the runtime',()=>{
  const [loaded]=loadApproved([{...source,approved:true}]);
  assert.equal(sourceMetadata(loaded).complete,true);assert.equal(String(loaded.year),String(source.year));assert.equal(loaded.section,source.section);
});

test('style routing separates Flash basic from Pro deep and sanitizes invalid overrides',()=>{
  assert.equal(modelOf({}),DEFAULT_MODEL);assert.equal(modelOf({},'deep'),DEFAULT_DEEP_MODEL);
  assert.equal(modelOf({GEMINI_MODEL:'gemini-3.8-flash',GEMINI_DEEP_MODEL:'gemini-3.1-pro-preview'},'deep'),'gemini-3.1-pro-preview');
  assert.equal(modelOf({GEMINI_DEEP_MODEL:'https://attacker.example'},'deep'),DEFAULT_DEEP_MODEL);
  const status=runtimeStatus({});assert.equal(status.models.basic,DEFAULT_MODEL);assert.equal(status.models.deep,DEFAULT_DEEP_MODEL);assert.equal(status.openSource.googleSearch,false);
});

test('runtime rejects an unconsulted clinical answer even when a plausible source is in the catalogue',async()=>{
  const report=await chat(payload,{env,sourceLoader:async()=>[source],modelFactory:({model})=>new OfflineModel(model),draftVerifier:async data=>data,
    agentRunner:async()=>({text:JSON.stringify({information:[information()]})})});
  assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);assert.ok(report.text.includes(MISSING));
});

test('authenticated internal review uses consulted closed passages only and never invokes open APIs',async()=>{
  let openCalls=0;
  const accessToken=issueAccessToken({env}).accessToken;
  const report=await chat({...payload,message:'Thẩm định đơn thuốc meropenem theo tài liệu.',answerStyle:'deep',accessToken},{env,sourceLoader:async()=>[source],openSourceLoader:async()=>{openCalls++;throw new Error('Must not query open sources');},
    draftVerifier:async data=>data,
    modelFactory:({model})=>{assert.equal(model,DEFAULT_DEEP_MODEL);return new OfflineModel(model);},
    agentRunner:async agent=>{
      assert.equal(agent.tools[0].name,'lookup_clinical_sources');
      const result=await agent.tools[0].runAsync({args:{query:'meropenem'},toolContext:{}});
      assert.equal(result.sources[0].excerpt,quote);
      return {text:JSON.stringify({information:[information()]})};
    }});
  assert.equal(openCalls,0);assert.equal(report.grounded,true);assert.equal(report.model,DEFAULT_DEEP_MODEL);assert.equal(report.sources[0].id,source.id);
  assert.equal(report.intent,'prescription_review');assert.match(report.text,/TÓM TẮT ĐƠN THUỐC/);
});

test('evidence verifier receives complete passages and cannot add items beyond its accepted IDs',async()=>{
  const data={overview:'Thông tin trong input.',information:[information()],findings:[finding()]};let calls=0;
  const result=await verifyDraft(data,recordMap(),{env,internalReview:true,input:'Thông tin trong input.',clientFactory:()=>({models:{generateContent:async request=>{
    calls++;const content=JSON.parse(request.contents[0].parts[0].text);
    assert.equal(content.input,'Thông tin trong input.');assert.equal(content.candidates[0].sources[0].excerpt,quote);
    assert.match(request.config.systemInstruction,/phủ định\/điều kiện\/ngoại lệ/);
    return {text:JSON.stringify({overview_supported:true,accepted_item_ids:['information_0','invented_item']})};
  }}})});
  assert.equal(calls,1);assert.deepEqual(result.information,data.information);assert.deepEqual(result.findings,[]);assert.equal(result.overview,data.overview);
});

test('a rejected opposite claim is absent after the verifier verdict',async()=>{
  const data={overview:'Chưa đủ dữ liệu.',information:[{text:'Được sử dụng meropenem dù có tiền sử quá mẫn nghiêm trọng.',evidence:evidence()}]};
  const result=await verifyDraft(data,recordMap(),{env,internalReview:true,clientFactory:()=>({models:{generateContent:async()=>({text:'{"overview_supported":false,"accepted_item_ids":[]}'})}})});
  assert.deepEqual(result.information,[]);
  assert.doesNotMatch(renderClinicalReport(result,recordMap()).text,/Được sử dụng meropenem/);
});

test('provider failure or malformed verifier JSON removes medical claims instead of bypassing verification',async()=>{
  const data={overview:'Tóm tắt chưa kiểm chứng.',information:[information()],findings:[finding()]};
  for(const generateContent of [async()=>{throw new Error('Offline provider failure');},async()=>({text:'not valid JSON'})]){
    const result=await verifyDraft(data,recordMap(),{env,internalReview:true,clientFactory:()=>({models:{generateContent}})});
    assert.deepEqual(result.information,[]);assert.deepEqual(result.findings,[]);assert.notEqual(result.overview,data.overview);
  }
});

test('no consulted evidence means no verifier client is constructed',async()=>{
  const result=await verifyDraft({information:[information()]},new Map(),{env,internalReview:true,clientFactory:()=>{throw new Error('Must not construct a network client');}});
  assert.deepEqual(result.information,[]);
});

test('ordered ellipsis fragments restore the full original passage, including negation and conditions over 3000 characters',()=>{
  const first='Không sử dụng meropenem khi người bệnh có tiền sử quá mẫn nghiêm trọng với thuốc.';
  const last='Chỉ cân nhắc sử dụng sau khi bác sĩ chuyên khoa đã đánh giá đầy đủ các ngoại lệ trong tài liệu.';
  const excerpt=first+'\n\n'+'Đây là ngữ cảnh đầy đủ được giữ nguyên để kiểm chứng. '.repeat(70)+'\n\n'+last;
  const value={...source,excerpt},shortened=first.toUpperCase().replaceAll(' ','  ')+' ... '+last;
  const data={information:[{...information(value),evidence:[{source_id:value.id,quote:shortened}]}]};
  const restored=restoreCompletePassages(data,recordMap(value));
  assert.equal(restored.information[0].evidence[0].quote,excerpt);
  assert.equal(data.information[0].evidence[0].quote,shortened,'restoration does not mutate the draft');
  assert.ok(excerpt.length>3000);assert.equal(wholeQuote(excerpt,restored.information[0].evidence[0].quote),true);
});

test('restoration never invents a fragment or reorders source passages to fit a draft',()=>{
  const first='Không sử dụng meropenem khi người bệnh có tiền sử quá mẫn nghiêm trọng với thuốc.';
  const last='Bác sĩ cần kiểm tra đầy đủ các điều kiện và ngoại lệ trong tài liệu trước khi quyết định.';
  const value={...source,excerpt:first+'\n\n'+last};
  for(const shortened of [first+' ... Nội dung bịa đặt không tồn tại trong bất kỳ đoạn nguồn nào.',last+' ... '+first]){
    const data={information:[{text:'Một nhận định chưa kiểm chứng.',evidence:[{source_id:value.id,quote:shortened}]}]};
    const restored=restoreCompletePassages(data,recordMap(value));
    assert.equal(restored.information[0].evidence[0].quote,shortened);
    assert.equal(validateEvidence(restored.information[0].evidence,recordMap(value)),null);
  }
});

test('restoring a shortened quote still requires verification and does not auto-accept an opposite clinical claim',async()=>{
  const first='Không sử dụng meropenem khi người bệnh có tiền sử quá mẫn nghiêm trọng với thuốc.';
  const last='Cần đối chiếu tiền sử quá mẫn và các điều kiện áp dụng trước khi dùng thuốc.';
  const value={...source,excerpt:first+'\n\n'+last};let calls=0;
  const data={information:[{text:'Được dùng meropenem cho mọi người bệnh có tiền sử quá mẫn nghiêm trọng.',evidence:[{source_id:value.id,quote:first+' ... '+last}]}]};
  const checked=await verifyDraft(data,recordMap(value),{env,internalReview:true,clientFactory:()=>({models:{generateContent:async request=>{
    calls++;const content=JSON.parse(request.contents[0].parts[0].text);
    assert.equal(content.candidates[0].item.evidence[0].quote,value.excerpt);
    assert.equal(content.candidates[0].sources[0].excerpt,value.excerpt);
    return {text:'{"overview_supported":false,"accepted_item_ids":[]}'};
  }}})});
  assert.equal(calls,1);assert.deepEqual(checked.information,[]);
  const report=renderClinicalReport(checked,recordMap(value));assert.equal(report.grounded,false);assert.doesNotMatch(report.text,/Được dùng meropenem/);
});
