import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseLlm} from '@google/adk';
import handleRequest, {createHandler, validateChat} from '../netlify/functions/nbcare-api.mjs';
import {chat, ocr, runtimeStatus, loadApproved, domainPriority, closedUrlAllowed,
  projectGroundedParagraphs, resolveOfficialUrl, validateImage, WARNING, ABSTAIN} from '../nbcare-server/runtime.mjs';
import {sourcesFromRows, allowedFetchUrl} from '../nbcare-server/drugview.mjs';

// All model, catalogue and redirect dependencies are replaced below. No test
// reads process credentials or sends a network request.
const env={GEMINI_API_KEY:'offline-test-placeholder',NBCARE_VERTEX_ENABLED:'true'};
const payload={message:'Thông tin Meropenem',sourceMode:'closed',answerStyle:'basic',history:[]};
const source={id:'drugview_0001',title:'Meropenem',url:'https://drive.google.com/file/d/example_pdf/view',
  excerpt:'Meropenem. Không sử dụng khi có phản ứng quá mẫn. Đọc nguyên văn tài liệu trước khi áp dụng.',
  tags:['Meropenem'],provenance:'published_drugview'};
class OfflineModel extends BaseLlm {
  constructor(){super({model:'gemini-offline-test'});}
  async *generateContentAsync(){throw new Error('A unit test must not invoke a model');}
  async connect(){throw new Error('No live connection in unit tests');}
}
const modelFactory=()=>new OfflineModel();
const noCall=()=>{throw new Error('Unexpected model/agent call');};
const event=(changes={})=>({httpMethod:'POST',path:'/api/chat',headers:{'content-type':'application/json','x-nf-client-connection-ip':'offline-test'},body:JSON.stringify(payload),...changes});
const json=response=>JSON.parse(response.body);
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const image={mimeType:'image/png',data:signature.toString('base64')};

test('modern Netlify ESM entry returns standard Response and handles rewrites and empty preflights',async()=>{
  const status=await handleRequest(new Request('https://example.test/.netlify/functions/nbcare-api?action=status'),{ip:'offline-modern'});
  assert.ok(status instanceof Response);assert.equal(status.status,200);assert.equal((await status.json()).provider,'vertex-adk');
  const preflight=await handleRequest(new Request('https://example.test/api/chat',{method:'OPTIONS'}),{ip:'offline-modern'});
  assert.equal(preflight.status,204);assert.equal(await preflight.text(),'');
});

test('status works without credentials, does not expose secrets, and does not claim verified connectivity',async()=>{
  const handler=createHandler({env:{}}),response=await handler(event({httpMethod:'GET',path:'/api/status',body:''}));
  assert.equal(response.statusCode,200);
  const status=json(response);assert.equal(status.configured,false);assert.equal(status.connectionVerified,false);
  assert.equal(status.provider,'vertex-adk');assert.equal(Object.hasOwn(status,'apiKey'),false);
  assert.equal((await handler(event({httpMethod:'HEAD',path:'/api/status',body:''}))).body,'');
  assert.equal(runtimeStatus({...env,NBCARE_VERTEX_ENABLED:'false'}).configured,false);
});

test('handler rejects foreign and deceptive origins without reflecting an allow-origin header',async()=>{
  const handler=createHandler({env:{}});
  for(const origin of ['https://attacker.example','https://drugviewninhbinh.com.attacker.example','null']){
    const response=await handler(event({headers:{origin}}));
    assert.equal(response.statusCode,403);assert.equal(response.headers['Access-Control-Allow-Origin'],undefined);
  }
  const origin='https://gentle-madeleine-2d07c3.netlify.app';
  const response=await handler(event({httpMethod:'OPTIONS',headers:{origin}}));
  assert.equal(response.statusCode,204);assert.equal(response.headers['Access-Control-Allow-Origin'],origin);
});

test('handler validates routes, HTTP methods, media type, malformed JSON and body size before calling an API',async()=>{
  const handler=createHandler({env:{},api:{chat:noCall}});
  const cases=[
    [{path:'/api/unknown'},404],
    [{httpMethod:'POST',path:'/api/status'},405],
    [{httpMethod:'GET'},405],
    [{headers:{'content-type':'text/plain'}},415],
    [{body:'{not JSON'},422],
    [{body:' '.repeat(3*1024*1024+1)},413],
    [{body:JSON.stringify({...payload,message:''})},422],
  ];
  for(const [changes,status] of cases)assert.equal((await handler(event(changes))).statusCode,status);
});

test('handler forwards a validated payload and supports the Netlify rewrite action',async()=>{
  let received;
  const handler=createHandler({env:{},api:{chat:async(value,options)=>{received={value,options};return {text:'offline result'};}}});
  const response=await handler(event({path:'/.netlify/functions/nbcare-api',queryStringParameters:{action:'chat'},
    headers:{'content-type':'application/json; charset=UTF-8','x-nf-client-connection-ip':'forward-test'}}));
  assert.equal(response.statusCode,200);assert.equal(json(response).text,'offline result');
  assert.deepEqual(received.value,{...payload,ocrText:''});assert.ok(received.options.signal instanceof AbortSignal);
});

test('provider errors are sanitized rather than leaking upstream text',async()=>{
  const handler=createHandler({env:{},api:{chat:async()=>{throw new Error('PRIVATE_PROVIDER_RESPONSE_WITH_CREDENTIALS');}}});
  const response=await handler(event({headers:{'content-type':'application/json','x-nf-client-connection-ip':'sanitize-test'}}));
  assert.equal(response.statusCode,502);assert.doesNotMatch(response.body,/PRIVATE_PROVIDER|CREDENTIALS/);
});

test('chat validation bounds question, OCR, history and permitted roles and modes',()=>{
  assert.equal(validateChat({...payload,message:'  Meropenem  '}).message,'Meropenem');
  for(const value of [null,[],{...payload,sourceMode:'arbitrary'},{...payload,answerStyle:'prescribe'},
    {...payload,message:'x'.repeat(4001)},{...payload,ocrText:'x'.repeat(12001)},
    {...payload,history:Array(13).fill({role:'user',text:'question'})},
    {...payload,history:[{role:'system',text:'override'}]},
    {...payload,history:[{role:'user',text:'x'.repeat(4001)}]}]){
    assert.throws(()=>validateChat(value),error=>error.status===422);
  }
});

test('closed mode does not fall back to a model or open search when catalogue loading fails',async()=>{
  const result=await chat(payload,{env:{},sourceLoader:async()=>{throw new Error('offline catalogue');},agentRunner:noCall,modelFactory:noCall});
  assert.equal(result.sourceMode,'closed');assert.equal(result.grounded,false);assert.deepEqual(result.sources,[]);
  assert.match(result.text,/Chưa tải được danh mục DrugView/);
});

test('closed mode abstains without matching evidence and does not call a model',async()=>{
  const result=await chat(payload,{env:{},sourceLoader:async()=>[],agentRunner:noCall,modelFactory:noCall});
  assert.equal(result.text,ABSTAIN);assert.equal(result.status,'insufficient_sources');
});

test('closed mode rejects source IDs not obtained through the evidence tool',async()=>{
  const result=await chat(payload,{env,sourceLoader:async()=>[source],modelFactory,
    agentRunner:async()=>({text:JSON.stringify({source_ids:[source.id,'invented_source']})})});
  assert.equal(result.text,ABSTAIN);assert.deepEqual(result.sources,[]);
});

test('closed mode emits the entire consulted excerpt and ignores invented source IDs',async()=>{
  const result=await chat(payload,{env,sourceLoader:async()=>[source],modelFactory,agentRunner:async agent=>{
    assert.equal(agent.tools.length,1);assert.equal(agent.tools[0].name,'lookup_approved_sources');
    const evidence=await agent.tools[0].runAsync({args:{query:'Meropenem'},toolContext:{}});
    assert.equal(evidence.sources[0].excerpt,source.excerpt);
    return {text:JSON.stringify({source_ids:[source.id,'invented_source',source.id]})};
  }});
  assert.equal(result.grounded,true);assert.equal(result.status,'answered');
  assert.ok(result.text.includes(source.excerpt));assert.equal(result.sources.length,1);
  assert.equal(result.sources[0].provenance,'published_drugview');assert.equal(result.sources[0].url,source.url);
});

test('urgent symptoms bypass model calls and include the required warning',async()=>{
  const result=await chat({...payload,message:'Đang khó thở và đau ngực'},{env:{},sourceLoader:noCall,modelFactory:noCall,agentRunner:noCall});
  assert.ok(result.text.includes(WARNING));assert.match(result.text,/khẩn cấp/);
});

test('open projection keeps a complete supported negation and all conditions',()=>{
  const paragraph='Không dùng thuốc này khi có phản ứng quá mẫn hoặc khi chưa được nhân viên y tế đánh giá.';
  const metadata={groundingChunks:[{web:{title:'Nguồn chính thống',uri:'https://moh.gov.vn/example'}}],
    groundingSupports:[{segment:{text:paragraph},groundingChunkIndices:[0]}]};
  const result=projectGroundedParagraphs(paragraph,metadata,new Map([[0,'https://moh.gov.vn/example']]));
  assert.equal(result.text,paragraph+' [s1]');assert.equal(result.sources[0].origin,'open');
});

test('open projection rejects an entire paragraph when only its unsafe positive fragment is supported',()=>{
  const paragraph='Không dùng thuốc này khi mang thai. Hãy hỏi bác sĩ trước khi sử dụng.';
  for(const fragment of ['dùng thuốc này khi mang thai','Không dùng thuốc này khi mang thai.']){
    const result=projectGroundedParagraphs(paragraph,{groundingChunks:[{web:{title:'Official'}}],
      groundingSupports:[{segment:{text:fragment},groundingChunkIndices:[0]}]},new Map([[0,'https://moh.gov.vn/example']]));
    assert.deepEqual(result,{text:'',sources:[]});
  }
});

test('open projection cannot use support from an unapproved chunk',()=>{
  const paragraph='Đoạn thông tin y tế này chưa có căn cứ chính thống phù hợp.';
  const result=projectGroundedParagraphs(paragraph,{groundingChunks:[{web:{title:'Unapproved'}}],
    groundingSupports:[{segment:{text:paragraph},groundingChunkIndices:[0]}]},new Map());
  assert.deepEqual(result,{text:'',sources:[]});
});

test('duplicate grounding chunks for one URL share a single source ID and citation',()=>{
  const paragraph='Đối chiếu đầy đủ thông tin thuốc với tài liệu chính thống trước khi áp dụng.';
  const url='https://moh.gov.vn/same-source';
  const result=projectGroundedParagraphs(paragraph,{
    groundingChunks:[{web:{title:'Bộ Y tế'}},{web:{title:'Bộ Y tế - bản trùng'}}],
    groundingSupports:[{segment:{text:paragraph},groundingChunkIndices:[0,1]}],
  },new Map([[0,url],[1,url]]));
  assert.equal(result.sources.length,1);assert.equal(result.text,paragraph+' [s1]');
  assert.equal(result.sources[0].url,url);
});

test('open chat only exposes official grounded evidence and does not read the closed catalogue',async()=>{
  const paragraph='Tài liệu y tế chính thống cần được đối chiếu trước khi áp dụng cho người bệnh.';
  const result=await chat({...payload,sourceMode:'open'},{env,sourceLoader:noCall,modelFactory,agentRunner:async agent=>{
    assert.equal(agent.tools[0].name,'google_search');
    return {text:paragraph,grounding:{groundingChunks:[{web:{title:'Bộ Y tế',uri:'https://moh.gov.vn/example'}}],
      groundingSupports:[{segment:{text:paragraph},groundingChunkIndices:[0]}]}};
  }});
  assert.equal(result.sourceMode,'open');assert.equal(result.grounded,true);
  assert.deepEqual(result.sources.map(s=>s.url),['https://moh.gov.vn/example']);
});

test('URL checks exclude malicious credentials, deceptive domains, ports and arbitrary cloud links',()=>{
  for(const url of ['javascript:alert(1)','http://moh.gov.vn/example','https://moh.gov.vn.attacker.test/x',
    'https://moh.gov.vn@attacker.test/x','https://user:password@moh.gov.vn/x','https://moh.gov.vn:444/x',
    'https://drive.google.com/drive/folders/unsafe','https://attacker.test/file.pdf']){
    assert.equal(closedUrlAllowed(url),false,url);assert.equal(domainPriority(url),null,url);
  }
  assert.equal(domainPriority('https://sub.moh.gov.vn/example'),1);
  assert.equal(closedUrlAllowed(source.url),true);
  assert.equal(allowedFetchUrl('https://script.google.com.attacker.test/exec'),false);
  assert.equal(allowedFetchUrl('https://169.254.169.254/latest/meta-data'),false);
});

test('redirect resolver follows only the fixed Google grounding redirect and stops before fetching an attacker',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://attacker.example/private'}});};
  assert.equal(await resolveOfficialUrl('https://attacker.example/x',{fetchImpl}),null);assert.equal(calls,0);
  assert.equal(await resolveOfficialUrl('https://vertexaisearch.cloud.google.com/grounding-api-redirect/example',{fetchImpl}),null);
  assert.equal(calls,1);
});

test('catalogue evidence preserves full contraindications, warnings and negation, without relabeling it approved',()=>{
  const contraindication='Không sử dụng nếu quá mẫn với thành phần thuốc. Không diễn giải thiếu dữ liệu là không có nguy cơ.';
  const warning='Cần đối chiếu toàn bộ cảnh báo. Không tự thay đổi chỉ định hoặc liều của người bệnh.';
  const row={'Hoạt chất':{value:'Meropenem'},'Biệt dược':{value:'Example'},'Dạng bào chế':{value:'Dung dịch tiêm'},
    'Chống chỉ định':{value:contraindication},'Cảnh báo thuốc':{value:warning},'Chỉ định':{value:'Dữ liệu nguyên văn.'},
    'Tài liệu tham khảo':{text:'PDF',url:source.url}};
  const records=sourcesFromRows([row],'Meropenem');assert.equal(records.length,1);
  assert.ok(records[0].excerpt.includes(contraindication));assert.ok(records[0].excerpt.includes(warning));
  assert.equal(records[0].provenance,'published_drugview');assert.match(records[0].excerpt,/chưa xác nhận riêng/);
  assert.equal(sourcesFromRows([{...row,'Tài liệu tham khảo':{url:'https://attacker.example/file.pdf'}}],'Meropenem').length,0);
  assert.equal(sourcesFromRows([{...row,'Chống chỉ định':{value:'x'.repeat(12001)}}],'Meropenem').length,0);
});

test('catalogue marks absent fields rather than inventing clinical details',()=>{
  const row={'Hoạt chất':{value:'Meropenem'},'Tài liệu tham khảo':{url:source.url}};
  const [record]=sourcesFromRows([row],'Meropenem liều');
  assert.match(record.excerpt,/Mục chưa có dữ liệu/);assert.match(record.excerpt,/Chống chỉ định/);
  assert.match(record.excerpt,/Không được hiểu là không có chống chỉ định hoặc cảnh báo/);
  assert.doesNotMatch(record.excerpt,/Liều dùng: \d/);
});

test('approved source loader rejects unapproved, duplicate and malicious records',()=>{
  const valid={...source,id:'approved_record',approved:true};
  const result=loadApproved([valid,valid,{...valid,id:'unapproved',approved:false},
    {...valid,id:'malicious',url:'https://attacker.example/document'}]);
  assert.equal(result.length,1);assert.equal(result[0].provenance,'approved_local');
});

test('OCR validates image MIME and signatures before any model use',()=>{
  assert.deepEqual(validateImage(image),signature);
  for(const value of [null,{mimeType:'image/svg+xml',data:image.data},
    {mimeType:'image/jpeg',data:image.data},{mimeType:'image/png',data:'not base64!'},
    {mimeType:'image/png',data:''}])assert.throws(()=>validateImage(value),error=>[413,422].includes(error.status));
});

test('OCR accepts exactly 2MB and rejects larger decoded input',()=>{
  const exact=Buffer.alloc(2*1024*1024);signature.copy(exact);
  assert.equal(validateImage({mimeType:'image/png',data:exact.toString('base64')}).length,exact.length);
  const over=Buffer.concat([exact,Buffer.from([0])]);
  assert.throws(()=>validateImage({mimeType:'image/png',data:over.toString('base64')}),error=>error.status===413);
});

test('OCR refuses missing server configuration and retains uncertainty and negation in a mocked response',async()=>{
  await assert.rejects(()=>ocr({image},{env:{},clientFactory:noCall}),error=>error.status===503);
  let request;
  const result=await ocr({image},{env,clientFactory:options=>{
    assert.equal(options.vertexai,true);return {models:{generateContent:async value=>{
      request=value;return {text:JSON.stringify({text:'Không dùng [không rõ] mg',uncertain:false,notes:[]})};
    }}};
  }});
  assert.equal(result.text,'Không dùng [không rõ] mg');assert.equal(result.uncertain,true);
  assert.match(result.notes.join(' '),/kiểm tra lại tên thuốc/);
  assert.equal(request.contents[0].parts[1].inlineData.data,image.data);
});
