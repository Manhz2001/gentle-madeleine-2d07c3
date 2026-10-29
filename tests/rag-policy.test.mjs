import test from 'node:test';
import assert from 'node:assert/strict';
import {renderClinicalReport,draftCandidates,applyDraftVerdict,INTENT_LABELS,MISSING,CLINICAL_INSTRUCTION,MODULE_SOURCE_PREFERENCES,isCompatibilityQuestion} from '../nbcare-server/clinical-policy.mjs';
import {verifyDraft} from '../nbcare-server/verify-draft.mjs';

// All medicines, cutoffs and schedules below are fictional fixture labels.
// They are not medical advice, do not represent a real product and are never
// sent to an external service or a real model.
const source=(id='fixture_a',extra={})=>({id,title:'Tài liệu mô phỏng — không dùng điều trị',documentTitle:'Tài liệu mô phỏng',
  year:2024,section:'Ví dụ kiểm thử',url:`https://moh.gov.vn/test-only/${id}`,
  excerpt:'Thuốc THỬ A và các lịch THAM_KHẢO_A trong đoạn này chỉ là dữ liệu mô phỏng để kiểm thử phần mềm, không áp dụng điều trị.',
  usableForIntervention:true,provenance:'approved_local',...extra});
const map=(...sources)=>new Map(sources.map(value=>[value.id,value]));
const evidence=value=>[{source_id:value.id,quote:value.excerpt}];
const info=(section,text,value)=>({section,text,evidence:evidence(value)});
const finding=(severity,value,extra={})=>({section:'interaction_severity',severity,issue:'Phân loại mô phỏng',mechanism:'Mức phân loại chỉ dùng cho kiểm thử phần mềm.',action:'',monitoring:'',absenceEvidenceExplicit:false,evidence:evidence(value),...extra});
const row=(value,organRange='< 17 đơn vị X',dose='THAM_KHẢO_A — chỉ mô phỏng')=>({organRange,dose,evidence:evidence(value)});
const render=(data,records,intent='general',input='Tra cứu THỬ A và THỬ B')=>renderClinicalReport(data,records,{intent,input});
const words=text=>text.split(/\s+/).filter(Boolean).length;

test('module priority policy preserves the three verified hospital sheet IDs and exact tabs',()=>{
  const expected={compatibility:['16DU7A9krRN4wvFqbjUphDVQpQg-COgA76HVoPvDCN0k','Ysite'],interactions:['1XKOSQrEAUXg1TPr7TlLUT7CET4ONkJVF9P9CDX3SXn0','Data'],mlct:['1vmuz5pDyPMleMZUFphZoGAAhOoXqB62eEing3NVn8gs','Du lieu chuan hoa']};
  for(const [kind,[sheetId,tab]] of Object.entries(expected)){
    assert.equal(MODULE_SOURCE_PREFERENCES[kind].sheetId,sheetId);assert.equal(MODULE_SOURCE_PREFERENCES[kind].tab,tab);
    assert.ok(CLINICAL_INSTRUCTION.includes(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`));
  }
  assert.match(CLINICAL_INSTRUCTION,/Nguồn đóng:[^\n]+không tự tìm bên ngoài/);
  assert.match(CLINICAL_INSTRUCTION,/Nguồn mở:[^\n]+sau khi đã kiểm tra module phù hợp/);
  assert.match(CLINICAL_INSTRUCTION,/MLCT không tự làm căn cứ hiệu chỉnh liều suy gan/);
});

test('physical compatibility questions are distinguished from oral coadministration and pharmacological interactions',()=>{
  for(const query of ['Hai thuốc THỬ A và THỬ B có tương kỵ khi pha chung không?','Kiểm tra Y-site hai thuốc thử.','Dùng chung đường truyền được không?','Tương hợp của hai dung dịch mô phỏng'])assert.equal(isCompatibilityQuestion(query),true,query);
  for(const query of ['THỬ A và THỬ B uống cùng được không?','Kiểm tra tương tác dược động học của hai thuốc','Dùng thuốc này cùng bữa ăn thế nào?'])assert.equal(isCompatibilityQuestion(query),false,query);
});

test('unverified Y-site codes cannot become interpreted compatibility results or handling advice',()=>{
  const value=source('raw-c',{sourceType:'drugview_module',moduleKind:'compatibility',legendVerified:false,usableForIntervention:true,excerpt:'Bản ghi kiểm thử chứa mã gốc C cho cặp THỬ A và THỬ B. Không có bảng chú giải được xác minh trong fixture này.'});
  const data={information:[info('compatibility_result','INVENTED_MEANING_FROM_C',value)],recommendations:[{section:'compatibility_management',proposal:'INVENTED_HANDLING_FROM_C',evidence:evidence(value)}]};
  assert.deepEqual(draftCandidates(data,map(value)),[]);
  const report=render(data,map(value),'interactions','THỬ A và THỬ B có tương kỵ khi pha chung không?');
  assert.doesNotMatch(report.text,/INVENTED_|> 🟢|> 🔴|> 🟡/);assert.match(report.text,/chưa có chú giải đã xác minh/);
  assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);
});

test('a verified compatibility result uses neutral physical labels and preserves provided conditions',()=>{
  const value=source('verified-compat',{sourceType:'drugview_module',moduleKind:'compatibility',legendVerified:true});
  const data={information:[info('compatibility_result','RESULT_FIXTURE_WITH_VERIFIED_LEGEND',value),info('compatibility_conditions','SOLVENT_CONCENTRATION_TIME_FIXTURE',value)],recommendations:[{section:'compatibility_management',proposal:'HANDLING_FROM_FIXTURE',evidence:evidence(value)}]};
  const report=render(data,map(value),'interactions','THỬ A và THỬ B có tương hợp Y-site không?');
  assert.ok(report.text.startsWith('**[PHÂN LOẠI]: TRA CỨU TƯƠNG HỢP / TƯƠNG KỴ'));
  assert.match(report.text,/RESULT_FIXTURE_WITH_VERIFIED_LEGEND/);assert.match(report.text,/SOLVENT_CONCENTRATION_TIME_FIXTURE/);assert.match(report.text,/HANDLING_FROM_FIXTURE/);
  assert.doesNotMatch(report.text,/KIỂM TRA TƯƠNG TÁC|MỨC ĐỘ:|> 🟢|> 🔴|> 🟡/);assert.equal(report.grounded,true);
  const candidate=draftCandidates(data,map(value))[0];assert.equal(candidate.sources[0].moduleKind,'compatibility');assert.equal(candidate.sources[0].legendVerified,true);
});

test('Y-site evidence cannot be repurposed as pharmacological interaction mechanisms or severity',()=>{
  const value=source('ysite-not-pharm',{sourceType:'drugview_module',moduleKind:'compatibility',legendVerified:true});
  const data={information:[info('mechanism','WRONG_PHARM_MECHANISM',value),info('consequences','WRONG_PHARM_CONSEQUENCE',value)],findings:[finding('green',value,{absenceEvidenceExplicit:true})],recommendations:[{section:'management',proposal:'WRONG_PHARM_HANDLING',evidence:evidence(value)}]};
  assert.deepEqual(draftCandidates(data,map(value)),[]);
  const report=render(data,map(value),'interactions','THỬ A và THỬ B uống cùng được không?');
  assert.doesNotMatch(report.text,/WRONG_|> 🟢/);assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);
});

test('pharmacological interaction sheet evidence cannot silently become a physical compatibility result',()=>{
  const value=source('pharm-not-ysite',{sourceType:'drugview_module',moduleKind:'interactions',legendVerified:true});
  const data={information:[info('compatibility_result','WRONG_PHYSICAL_RESULT',value),info('compatibility_conditions','WRONG_PHYSICAL_CONDITIONS',value)]};
  assert.deepEqual(draftCandidates(data,map(value)),[]);
  const report=render(data,map(value),'interactions','Có thể pha chung THỬ A và THỬ B không?');
  assert.doesNotMatch(report.text,/WRONG_PHYSICAL/);assert.equal(report.grounded,false);
});

test('a hospital sheet locator does not fabricate the year or source pages required for a clinical claim',()=>{
  const value=source('actual-locator',{sourceType:'drugview_module',moduleKind:'compatibility',legendVerified:true,year:undefined,section:'Ysite — định danh bản ghi STT thử nghiệm'});
  const report=render({information:[info('compatibility_result','CLINICAL_RESULT_WITHOUT_YEAR',value)]},map(value),'interactions','Kiểm tra Y-site THỬ A và THỬ B');
  assert.ok(report.text.includes(MISSING));assert.doesNotMatch(report.text,/CLINICAL_RESULT_WITHOUT_YEAR|trang\s+\d|năm 2026/);assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);
});

test('RAG other: grounded short answers retain source metadata without forcing drug templates',()=>{
  const value=source('short-answer');
  const report=render({information:[info('answer','DEFINITION_FROM_PROVIDED_CONTEXT',value)]},map(value),'other','Giải thích thuật ngữ mô phỏng');
  assert.equal(report.intent,'other');assert.equal(report.grounded,true);
  assert.match(report.text,/DEFINITION_FROM_PROVIDED_CONTEXT/);assert.match(report.text,/2024/);assert.match(report.text,/Ví dụ kiểm thử/);
  assert.doesNotMatch(report.text,/PHÂN LOẠI|TỔNG QUAN VỀ|LIỀU KHUYẾN CÁO|KIỂM TRA TƯƠNG TÁC/);
  assert.deepEqual(report.sources.map(s=>s.id),[value.id]);assert.ok(words(report.text)<=145);
});

test('RAG other: unavailable or fabricated evidence is not replaced by remembered medical facts',()=>{
  const value=source('unknown-year',{year:undefined});
  for(const evidenceItems of [evidence(value),[{source_id:'invented',quote:value.excerpt}]]){
    const report=render({information:[{section:'answer',text:'UNVERIFIED_MEDICAL_FACT',evidence:evidenceItems}]},map(value),'other');
    assert.doesNotMatch(report.text,/UNVERIFIED_MEDICAL_FACT/);assert.ok(report.text.includes(MISSING));
    assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);
    assert.doesNotMatch(report.text,/TỔNG QUAN|PHÂN LOẠI|\[S\d+\]/);
  }
});

test('RAG other: unrelated dose and warning fields cannot leak into a concise explanation',()=>{
  const value=source('only-answer');
  const report=render({information:[info('identity','WRONG_IDENTITY_FIELD',value),info('answer','SHORT_EXPLANATION',value)],findings:[finding('red',value,{mechanism:'WRONG_MEDICAL_WARNING'})],doseTable:[row(value,'WRONG_DOSE_RANGE','WRONG_DOSE_VALUE')]},map(value),'other');
  assert.match(report.text,/SHORT_EXPLANATION/);assert.doesNotMatch(report.text,/WRONG_|🔴|\| :---/);
});

test('RAG other: the short-answer limit reserves warning space and removes entire uncited blocks',()=>{
  const sources=[source('first'),source('second'),source('third')];
  const report=render({information:sources.map((value,index)=>info('answer',`WHOLE_BLOCK_${index} `+'nội dung '.repeat(40),value))},map(...sources),'other');
  assert.ok(words(report.text)<=145);
  for(const value of report.sources)assert.ok(report.text.includes(value.url));
  for(let index=0;index<sources.length;index++)if(!report.text.includes(`WHOLE_BLOCK_${index}`))assert.ok(!report.sources.some(value=>value.id===sources[index].id));
});

test('RAG verifier: structured output cannot add unknown item IDs or untyped verdict properties',async()=>{
  const value=source('bounded-verdict'),data={information:[info('answer','BRIEF_SUPPORTED_RESPONSE',value)]};let config;
  await verifyDraft(data,map(value),{env:{GEMINI_API_KEY:'offline-only'},intent:'other',input:'Giải thích thuật ngữ mô phỏng',clientFactory:()=>({models:{generateContent:async request=>{config=request.config;return {text:JSON.stringify({overview_supported:false,patient_context_supported:false,sufficient_dose_context:false,accepted_item_ids:['information_0']})};}}})});
  assert.equal(config.responseMimeType,'application/json');assert.equal(config.responseJsonSchema.additionalProperties,false);
  assert.deepEqual(config.responseJsonSchema.required,['overview_supported','patient_context_supported','sufficient_dose_context','accepted_item_ids']);
  assert.equal(config.responseJsonSchema.properties.overview_supported.type,'boolean');
  assert.deepEqual(config.responseJsonSchema.properties.accepted_item_ids.items.enum,['information_0']);
  assert.equal(Object.hasOwn(config,'temperature'),false);
});

test('RAG protocol: each public intent begins with its exact bold classification and required headings',()=>{
  const cases={
    general:['TỔNG QUAN VỀ','HƯỚNG DẪN SỬ DỤNG CƠ BẢN','LƯU Ý LÂM SÀNG QUAN TRỌNG'],
    interactions:['KẾT QUẢ KIỂM TRA TƯƠNG TÁC','PHÂN TÍCH LÂM SÀNG','ĐỀ XUẤT XỬ TRÍ'],
    special_dose:['HIỆU CHỈNH LIỀU','LIỀU KHUYẾN CÁO HIỆN TẠI','BẢNG THAM KHẢO NHANH'],
  };
  for(const [intent,headings] of Object.entries(cases)){
    const report=render({},new Map(),intent);
    assert.ok(report.text.startsWith(`**[PHÂN LOẠI]: ${INTENT_LABELS[intent]}**`));
    for(const heading of headings)assert.ok(report.text.includes(heading),heading);
    assert.ok(report.text.includes(MISSING));assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);
    assert.doesNotMatch(report.text,/TÓM TẮT ĐƠN THUỐC|ĐỀ XUẤT CAN THIỆP DƯỢC LÂM SÀNG/);
  }
});

test('RAG protocol: clinical facts without a verified year and real page or section are absent in every intent',()=>{
  for(const missing of [{year:undefined},{year:'2024; page 99'},{section:'',page:undefined}]){
    const value=source('incomplete',missing),marker='UNSUPPORTED_CLINICAL_FACT';
    const data={information:[info('identity',marker,value),info('mechanism',marker,value)],doseTable:[row(value,marker,marker)]};
    for(const intent of ['general','interactions','special_dose']){
      const report=render(data,map(value),intent);assert.doesNotMatch(report.text,/UNSUPPORTED_CLINICAL_FACT/);
      assert.equal(report.grounded,false);assert.deepEqual(report.sources,[]);
    }
  }
});

test('RAG protocol: non-intervention facts also require real citation metadata',()=>{
  const value=source('missing-year',{year:undefined});
  const candidates=draftCandidates({information:[info('identity','IDENTITY_WITHOUT_YEAR',value),info('indications','INDICATION_WITHOUT_YEAR',value),info('mechanism','MECHANISM_WITHOUT_YEAR',value)]},map(value));
  assert.deepEqual(candidates,[]);
});

test('RAG protocol: a real XML section can be cited without inventing a page',()=>{
  const value=source('xml',{sourceType:'us_spl',section:'Mục mô phỏng có thật trong fixture',page:undefined});
  const report=render({information:[info('identity','IDENTITY_FROM_VERIFIED_SOURCE',value)]},map(value));
  assert.match(report.text,/IDENTITY_FROM_VERIFIED_SOURCE/);assert.match(report.text,/2024 \(năm hiệu lực SPL\)/);
  assert.match(report.text,/Mục mô phỏng có thật trong fixture/);assert.doesNotMatch(report.text,/trang\s+\d/i);
  assert.match(report.text,/SPL Hoa Kỳ/);assert.deepEqual(report.sources.map(s=>s.id),[value.id]);
});

test('RAG protocol: a verified page is retained instead of generating another locator',()=>{
  const value=source('page',{section:'',page:'12'});
  const report=render({information:[info('identity','IDENTITY_PAGE_FIXTURE',value)]},map(value));
  assert.match(report.text,/trang 12/);assert.doesNotMatch(report.text,/trang 13/);
});

test('RAG protocol: unknown source IDs and fabricated quote fragments never appear as clinical facts',()=>{
  const value=source();const item=info('identity','INVENTED_FACT',value);
  for(const changed of [{evidence:[{source_id:'not_consulted',quote:value.excerpt}]},{evidence:[{source_id:value.id,quote:'Câu trích này hoàn toàn không có trong nguồn đã cung cấp.'}]}]){
    const report=render({information:[{...item,...changed}]},map(value));
    assert.doesNotMatch(report.text,/INVENTED_FACT/);assert.equal(report.grounded,false);
  }
});

test('RAG interactions: only the highest verified severity has a callout and citation',()=>{
  const red=source('red'),yellow=source('yellow'),green=source('green');
  const report=render({findings:[finding('yellow',yellow),finding('green',green,{absenceEvidenceExplicit:true}),finding('red',red)]},map(red,yellow,green),'interactions');
  assert.equal((report.text.match(/^> (?:🔴|🟡|🟢)/gm)||[]).length,1);
  assert.match(report.text,/> 🔴 \*\*MỨC ĐỘ: CHỐNG CHỈ ĐỊNH/);
  assert.doesNotMatch(report.text,/> 🟡|> 🟢/);assert.deepEqual(report.sources.map(s=>s.id),['red']);
});

test('RAG interactions: green requires the explicit-absence flag and a complete consulted quote',()=>{
  const value=source('absence',{excerpt:'Trong mô phỏng, cặp THỬ A và THỬ B được xác nhận không có tương tác đáng kể. Đây chỉ là fixture kiểm thử, không áp dụng điều trị.'});
  const valid=finding('green',value,{absenceEvidenceExplicit:true});
  assert.match(render({findings:[valid]},map(value),'interactions').text,/> 🟢/);
  for(const changed of [{absenceEvidenceExplicit:false},{absenceEvidenceExplicit:undefined},{evidence:[]},{evidence:[{source_id:'invented',quote:value.excerpt}]}]){
    const report=render({findings:[{...valid,...changed}]},map(value),'interactions');
    assert.doesNotMatch(report.text,/> 🟢/);assert.equal(report.grounded,false);
    assert.match(report.text,/không diễn giải là không có tương tác/);
  }
});

test('RAG special dose: actual source comparator symbols and escaped table pipes are retained',()=>{
  const value=source('ranges',{excerpt:'Dữ liệu mô phỏng: với chức năng < 17 đơn vị X dùng THAM_KHẢO_A; với ≥ 17 và ≤ 42 đơn vị X dùng THAM_KHẢO_B; với > 42 đơn vị X dùng THAM_KHẢO_C. Không áp dụng điều trị.'});
  const report=render({doseTable:[row(value,'< 17 đơn vị X','THAM_KHẢO_A'),row(value,'≥ 17 và ≤ 42 đơn vị X','THAM_KHẢO_B | điều kiện giả lập'),row(value,'> 42 đơn vị X','THAM_KHẢO_C')]},map(value),'special_dose');
  assert.match(report.text,/\| < 17 đơn vị X \|/);assert.match(report.text,/≥ 17 và ≤ 42/);assert.match(report.text,/\| > 42 đơn vị X \|/);
  assert.ok(report.text.includes('THAM_KHẢO_B \\| điều kiện giả lập'));
  assert.equal((report.text.match(/^\| < 17|^\| ≥ 17|^\| > 42/gm)||[]).length,3);
});

test('RAG special dose: there is no canned 50/30 dosing table when no source rows exist',()=>{
  const report=render({},new Map(),'special_dose');
  assert.doesNotMatch(report.text,/\|\s*(?:Mức|>|<|30|50)/);assert.doesNotMatch(report.text,/30\s*[-–]\s*50/);
  assert.match(report.text,/Không tự tạo khoảng CrCl\/eGFR hoặc liều mẫu/);
});

test('RAG special dose: table rows without evidence or with abstract-only evidence are omitted whole',()=>{
  const reference=source('abstract',{evidenceLevel:'abstract_only',usableForIntervention:false});
  const value=source('normal');
  const report=render({doseTable:[{organRange:'INVENTED_RANGE',dose:'INVENTED_DOSE',evidence:[]},row(reference,'ABSTRACT_RANGE','ABSTRACT_DOSE'),{...row(value,'BAD_QUOTE_RANGE','BAD_QUOTE_DOSE'),evidence:[{source_id:value.id,quote:'Một câu không có trong tài liệu nguồn.'}]}]},map(reference,value),'special_dose');
  assert.doesNotMatch(report.text,/INVENTED_RANGE|INVENTED_DOSE|ABSTRACT_RANGE|ABSTRACT_DOSE|BAD_QUOTE_RANGE|BAD_QUOTE_DOSE/);
  assert.deepEqual(report.sources,[]);assert.equal(report.grounded,false);
});

test('RAG special dose: a verified reference table can be shown without selecting an individual dose',()=>{
  const value=source('reference');const data={patientContext:'PATIENT_FACT_NOT_VERIFIED',_patientContextVerified:false,_doseContextComplete:false,
    recommendations:[{section:'adjusted_dose',proposal:'INDIVIDUAL_DOSE_MUST_NOT_SHOW',evidence:evidence(value)}],doseTable:[row(value)]};
  const report=render(data,map(value),'special_dose');
  assert.match(report.text,/THAM_KHẢO_A/);assert.match(report.text,/Chưa chọn một liều cá thể hóa/);
  assert.doesNotMatch(report.text,/PATIENT_FACT_NOT_VERIFIED|INDIVIDUAL_DOSE_MUST_NOT_SHOW/);
  assert.doesNotMatch(report.text,/> 🟡|> 🔴/);
});

test('RAG special dose: patient verification alone is insufficient to select a dose',()=>{
  const value=source('context'),data={patientContext:'Dữ kiện người dùng mô phỏng',_patientContextVerified:true,_doseContextComplete:false,
    findings:[finding('yellow',value,{section:'adjusted_dose',mechanism:'INDIVIDUAL_DOSE_REQUIRES_ADEQUACY'})],doseTable:[row(value)]};
  const report=render(data,map(value),'special_dose');
  assert.match(report.text,/Dữ kiện người dùng mô phỏng/);assert.match(report.text,/THAM_KHẢO_A/);
  assert.doesNotMatch(report.text,/INDIVIDUAL_DOSE_REQUIRES_ADEQUACY|> 🟡/);
});

test('RAG special dose: both independently verified context flags permit the supported dose proposal',()=>{
  const value=source('complete'),data={patientContext:'Dữ kiện đã kiểm chứng trong fixture',_patientContextVerified:true,_doseContextComplete:true,
    recommendations:[{section:'adjusted_dose',proposal:'LỊCH_CHỌN_CÁ_THỂ_HÓA — chỉ mô phỏng',evidence:evidence(value)}]};
  const report=render(data,map(value),'special_dose');
  assert.match(report.text,/> 🟡 \*\*ĐIỀU CHỈNH LIỀU/);assert.match(report.text,/LỊCH_CHỌN_CÁ_THỂ_HÓA/);
});

test('RAG protocol: fields from another intent cannot leak into the selected template or citations',()=>{
  const value=source('wrong-template');
  const general=render({intent:'interactions',information:[info('mechanism','WRONG_MECHANISM',value)],doseTable:[row(value,'WRONG_RANGE','WRONG_DOSE')],recommendations:[{section:'management',proposal:'WRONG_MANAGEMENT',evidence:evidence(value)}]},map(value),'general');
  assert.ok(general.text.startsWith(`**[PHÂN LOẠI]: ${INTENT_LABELS.general}**`));
  assert.doesNotMatch(general.text,/WRONG_MECHANISM|WRONG_RANGE|WRONG_DOSE|WRONG_MANAGEMENT/);assert.deepEqual(general.sources,[]);
  const pair=render({information:[info('identity','WRONG_IDENTITY',value)],doseTable:[row(value,'WRONG_RANGE','WRONG_DOSE')]},map(value),'interactions');
  assert.doesNotMatch(pair.text,/WRONG_IDENTITY|WRONG_RANGE|WRONG_DOSE/);assert.deepEqual(pair.sources,[]);
});

test('RAG protocol: a model cannot invent a medicine name in the report heading',()=>{
  const report=render({drugNames:['FABRICATED_MEDICINE_NOT_IN_INPUT']},new Map(),'general','Người dùng hỏi THỬ A là thuốc gì?');
  assert.doesNotMatch(report.text,/FABRICATED_MEDICINE_NOT_IN_INPUT/);assert.match(report.text,/TỔNG QUAN VỀ THUỐC ĐƯỢC HỎI/);
  const named=render({drugNames:['THỬ A']},new Map(),'general','Người dùng hỏi THỬ A là thuốc gì?');
  assert.match(named.text,/TỔNG QUAN VỀ THỬ A/);
});

test('RAG protocol: overlong verified facts are pruned as complete blocks under each intent word limit',()=>{
  const sources=Array.from({length:8},(_,index)=>source('budget_'+index,{title:('Tài liệu mô phỏng '+index+' ').repeat(8).trim(),documentTitle:('Tài liệu mô phỏng '+index+' ').repeat(8).trim()}));
  for(const [intent,limit,section] of [['general',300,'identity'],['interactions',400,'mechanism'],['special_dose',350,'organ_stage']]){
    const data={information:sources.map((value,index)=>info(section,('FACT_'+index+' nguyên vẹn. ').repeat(12).trim(),value)),doseTable:sources.slice(0,6).map((value,index)=>row(value,'RANGE_'+index,('SCHEDULE_'+index+' điều kiện. ').repeat(8).trim()))};
    const report=render(data,map(...sources),intent);
    assert.ok(words(report.text)<=limit,`${intent}: ${words(report.text)} > ${limit}`);
    assert.ok(report.sources.length<sources.length);
    for(const value of report.sources)assert.ok(report.text.includes(`](${value.url})`));
    for(const value of sources.filter(s=>!report.sources.some(used=>used.id===s.id)))assert.ok(!report.text.includes(`](${value.url})`));
  }
});

test('RAG verification: dose table rows are candidates and only accepted known row IDs survive',()=>{
  const value=source('table-verdict'),data={doseTable:[row(value,'VERIFIED_RANGE','VERIFIED_SCHEDULE'),{organRange:'FAKE_RANGE',dose:'FAKE_DOSE',evidence:[{source_id:'unknown',quote:value.excerpt}]}]};
  const candidates=draftCandidates(data,map(value));assert.deepEqual(candidates.map(c=>c.id),['doseTable_0']);
  assert.equal(candidates[0].sources[0].excerpt,value.excerpt);
  const checked=applyDraftVerdict(data,candidates,{accepted_item_ids:['doseTable_0','doseTable_1','invented_999']});
  assert.deepEqual(checked.doseTable,[data.doseTable[0]]);
});

test('RAG verification: patient facts and sufficient dose context are independently validated and cannot be spoofed by draft flags',()=>{
  const value=source('flags'),data={patientContext:'Dữ kiện do người dùng cung cấp',_patientContextVerified:true,_doseContextComplete:true,doseTable:[row(value)]},candidates=draftCandidates(data,map(value));
  const onlyPatient=applyDraftVerdict(data,candidates,{patient_context_supported:true,sufficient_dose_context:false,accepted_item_ids:['doseTable_0']});
  assert.equal(onlyPatient.patientContext,data.patientContext);assert.equal(onlyPatient._patientContextVerified,true);assert.equal(onlyPatient._doseContextComplete,false);assert.equal(onlyPatient.doseTable.length,1);
  const onlyDose=applyDraftVerdict(data,candidates,{patient_context_supported:false,sufficient_dose_context:true,accepted_item_ids:['doseTable_0']});
  assert.equal(onlyDose.patientContext,'');assert.equal(onlyDose._patientContextVerified,false);assert.equal(onlyDose._doseContextComplete,false);
  const complete=applyDraftVerdict(data,candidates,{patient_context_supported:true,sufficient_dose_context:true,accepted_item_ids:['doseTable_0']});
  assert.equal(complete._patientContextVerified,true);assert.equal(complete._doseContextComplete,true);
});

test('RAG verification: a rejected clinical table or green claim does not bypass the second verifier',async()=>{
  const value=source('verification'),data={intent:'special_dose',patientContext:'Thông tin mô phỏng',doseTable:[row(value,'UNSUPPORTED_SELECTED_RANGE','UNSUPPORTED_SELECTED_DOSE')],findings:[finding('green',value,{absenceEvidenceExplicit:true})]};
  let received;
  const checked=await verifyDraft(data,map(value),{env:{GEMINI_API_KEY:'offline-placeholder'},input:'Câu hỏi mô phỏng',intent:'special_dose',clientFactory:()=>({models:{generateContent:async request=>{
    received=JSON.parse(request.contents[0].parts[0].text);
    return {text:JSON.stringify({patient_context_supported:false,sufficient_dose_context:false,accepted_item_ids:[]})};
  }}})});
  assert.ok(received.candidates.some(candidate=>candidate.id==='doseTable_0'));
  assert.ok(received.candidates.some(candidate=>candidate.id==='findings_0'));
  assert.deepEqual(checked.doseTable,[]);assert.deepEqual(checked.findings,[]);
  assert.equal(checked._patientContextVerified,false);assert.equal(checked._doseContextComplete,false);
});
