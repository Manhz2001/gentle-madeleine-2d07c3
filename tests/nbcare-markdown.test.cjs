const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../nbcare/app.js'),'utf8');

// The renderer runs with a minimal DOM: assigning raw HTML is deliberately absent.
class Node {
  constructor(tag,text=''){this.tagName=tag;this.childNodes=[];this._text=text;this.classList={add:value=>{this.className=[this.className,value].filter(Boolean).join(' ');}};}
  set textContent(value){this._text=String(value);this.childNodes=[];}
  get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}
  append(...nodes){this.childNodes.push(...nodes);}
  replaceChildren(...nodes){this._text='';this.childNodes=[];this.append(...nodes);}
  addEventListener(name,fn){(this.listeners??={})[name]=fn;}
  setAttribute(name,value){(this.attributes??={})[name]=String(value);}
}
const document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',String(text)),createDocumentFragment:()=>new Node('#fragment')};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const context=vm.createContext({document,el,Map,Set,String,URL});
const start=code.indexOf('  function renderMarkdown('),end=code.indexOf('  const modeName');
assert.ok(start>0&&end>start);
vm.runInContext(code.slice(start,end)+'\nthis.renderMarkdown=renderMarkdown;',context);
const render=context.renderMarkdown;
const all=node=>[node,...node.childNodes.flatMap(all)];
const source={id:'s1',title:'Hướng dẫn chính thức',url:'https://moh.gov.vn/example',citation:'Bộ Y tế, 2024, Mục 2'};

test('clinical Markdown builds headings, lists, bold and accessible severity text',()=>{
  const tree=render('### 1. TÓM TẮT ĐƠN THUỐC\n- **Hoạt chất:** Chưa đủ dữ liệu.\n\n> 🔴 **CẢNH BÁO MỨC ĐỘ 1**\n> - Không tự ngừng thuốc. [s1]\n\n> 🟡 **LƯU Ý MỨC ĐỘ 2**\n> - Cần đối chiếu.\n\n> 🟢 **ĐÁNH GIÁ**\n> - Chỉ theo phạm vi đã xác minh.',[source]);
  const nodes=all(tree);
  assert.ok(nodes.some(n=>n.tagName==='h3'));
  assert.ok(nodes.some(n=>n.tagName==='strong'&&n.textContent==='Hoạt chất:'));
  assert.ok(nodes.some(n=>n.tagName==='ul'));
  for(const cls of ['is-critical','is-caution','is-suitable'])assert.ok(nodes.some(n=>n.tagName==='blockquote'&&n.className.includes(cls)));
  assert.ok(tree.textContent.includes('Không tự ngừng thuốc.'));
});

test('raw HTML, image markup and unverified links cannot create executable elements or URLs',()=>{
  const tree=render('<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n![ảnh](https://evil.test/image.png)\n[x](javascript:alert(1))\n[ngoài danh sách](https://evil.test/)\n[giả mạo](https://moh.gov.vn@evil.test/)',[source]);
  const nodes=all(tree);
  assert.equal(nodes.filter(n=>['img','script','iframe','a'].includes(n.tagName)).length,0);
  assert.ok(tree.textContent.includes('<script>alert(1)</script>'));
});

test('only verified evidence links and known source IDs become HTTPS links',()=>{
  const tree=render('[Đọc tài liệu](https://moh.gov.vn/example) [s1] [invented]',[source]);
  const links=all(tree).filter(n=>n.tagName==='a');
  assert.equal(links.length,2);
  for(const link of links){assert.equal(link.href,source.url);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');}
  assert.ok(tree.textContent.includes('[invented]'));
});

test('deeply nested quotations terminate and preserve clinical negations',()=>{
  const tree=render('> > > > > **Không được tự ý đổi liều.**');
  assert.ok(tree.textContent.includes('Không được tự ý đổi liều.'));
  assert.ok(all(tree).filter(n=>n.tagName==='blockquote').length<=3);
});

test('removed global source panels and Google suggestions renderer are absent',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../nbcare/index.html'),'utf8');
  for(const id of ['sourceDescription','openLibrary','evidenceContent','mobileSources'])assert.ok(!html.includes(`id="${id}"`));
  assert.ok(!code.includes('searchSuggestionsHtml'));
  assert.ok(!code.includes('srcdoc'));
  assert.ok(html.includes('id="sourcesDialog"'));
  assert.ok(!code.includes('WHO & cơ quan y tế'));
  assert.ok(!code.includes('Căn cứ tìm được qua Gemini'));
});

test('returned source citations and reference limitations remain bounded and preserve provenance',()=>{
  const start=code.indexOf('  function safeSources('),end=code.indexOf('  function evidenceNodes(');
  vm.runInContext(code.slice(start,end)+'\nthis.safeSources=safeSources;',context);
  const result=context.safeSources([{id:'dm_example',title:'DailyMed label',url:'https://dailymed.nlm.nih.gov/example',citation:'DailyMed, 2025, Mục 4',limitations:'Nhãn SPL Hoa Kỳ. Không phải SPC Việt Nam.',provenance:'official_dailymed'}]);
  assert.equal(result.length,1);assert.equal(result[0].citation,'DailyMed, 2025, Mục 4');assert.equal(result[0].provenance,'official_dailymed');assert.ok(result[0].limitations.includes('Không phải SPC Việt Nam.'));
  const long=context.safeSources([{id:'pm_example',url:'https://pubmed.ncbi.nlm.nih.gov/1/',limitations:'x'.repeat(2000),provenance:'pubmed_abstract'}]);
  assert.equal(long[0].limitations.length,1200);assert.equal(long[0].provenance,'pubmed_abstract');
});

test('reference tables use semantic headers and a keyboard-scrollable region without requiring a preceding blank line',()=>{
  const tree=render('Bảng theo tài liệu đã xác minh:\n| Chức năng cơ quan | Liều theo nguồn |\n| :--- | ---: |\n| Mức trong nguồn | Chưa có dữ liệu |');
  const nodes=all(tree),table=nodes.find(n=>n.tagName==='table'),wrap=nodes.find(n=>n.className==='markdown-table-wrap');
  assert.ok(table);assert.equal(wrap.attributes.role,'region');assert.ok(wrap.attributes['aria-label']);assert.equal(wrap.tabIndex,0);
  assert.equal(nodes.filter(n=>n.tagName==='thead').length,1);assert.equal(nodes.filter(n=>n.tagName==='tbody').length,1);
  assert.equal(nodes.filter(n=>n.tagName==='th').length,2);assert.ok(nodes.filter(n=>n.tagName==='th').every(n=>n.attributes.scope==='col'));
  assert.equal(nodes.find(n=>n.tagName==='th'&&n.textContent==='Liều theo nguồn').className,'is-right-aligned');
  assert.ok(tree.textContent.includes('Bảng theo tài liệu đã xác minh:'));
});

test('escaped and code-span pipes remain in their original cells rather than splitting clinical data',()=>{
  const tree=render('| `CrCl | eGFR` | Tài liệu |\n| --- | --- |\n| Mục A \\| mục B | `Không | tự đổi liều` |');
  const cells=all(tree).filter(n=>['th','td'].includes(n.tagName));
  assert.equal(cells.length,4);assert.equal(cells[0].textContent,'CrCl | eGFR');assert.equal(cells[2].textContent,'Mục A | mục B');assert.equal(cells[3].textContent,'Không | tự đổi liều');
});

test('table cells cannot execute HTML or activate unverified links while verified citations still work',()=>{
  const tree=render('| Nội dung | Nguồn |\n| --- | --- |\n| <img src=x onerror=alert(1)> | [s1] |\n| <script>alert(1)</script> | [giả](https://evil.test/) |',[source]);
  const nodes=all(tree),links=nodes.filter(n=>n.tagName==='a');
  assert.equal(nodes.filter(n=>['img','script','iframe'].includes(n.tagName)).length,0);assert.equal(links.length,1);assert.equal(links[0].href,source.url);
  assert.ok(tree.textContent.includes('<img src=x onerror=alert(1)>'));assert.ok(tree.textContent.includes('<script>alert(1)</script>'));
});

test('malformed table dividers stay as text and mismatched rows are preserved outside a valid table',()=>{
  const malformed=render('| A | B |\n| :--- | -- |\n| Không bỏ điều kiện | Tài liệu |');
  assert.equal(all(malformed).filter(n=>n.tagName==='table').length,0);assert.ok(malformed.textContent.includes('Không bỏ điều kiện'));
  const tree=render('| A | B |\n| --- | --- |\n| Nội dung đúng | Theo nguồn |\n| Nội dung lệch | Không được bỏ | Ngoại lệ đầy đủ |');
  assert.equal(all(tree).filter(n=>n.tagName==='td').length,2);assert.ok(tree.textContent.includes('Nội dung lệch | Không được bỏ | Ngoại lệ đầy đủ'));
});

test('table rendering bounds columns and rows without silently deleting overflow text',()=>{
  const tooWide=render('| A | B | C | D | E | F | G | H | I |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  assert.equal(all(tooWide).filter(n=>n.tagName==='table').length,0);
  const text='| A | B |\n| --- | --- |\n'+Array.from({length:51},(_,i)=>`| Điều kiện ${i} | Không tự đổi liều ${i} |`).join('\n');
  const tree=render(text);assert.equal(all(tree).filter(n=>n.tagName==='td').length,100);assert.ok(tree.textContent.includes('Điều kiện 50 | Không tự đổi liều 50'));
});

function accessHarness(response={accessToken:'opaque-session-token-for-test',expiresAt:Date.now()+1800000},status=200){
  const requests=[],notices=[];function field(extra={}){const listeners={};return {value:'',hidden:true,disabled:false,textContent:'',...extra,addEventListener(name,fn){listeners[name]=fn;},emit(name,event={}){return listeners[name]?.(event);},focus(){this.focused=true;}};}
  const fields={accessPin:field(),accessError:field(),accessSubmit:field(),accessForm:field(),accessDialog:field({open:false,showModal(){this.open=true;},close(){this.open=false;this.emit('close');}})};
  const buttons=['basic','deep'].map(style=>field({dataset:{style},classList:{toggle(){}},setAttribute(){}}));
  const authState={answerStyle:'basic',accessToken:null,accessExpiresAt:0,api:null},question=field();
  const authContext=vm.createContext({state:authState,$:id=>fields[id],document:{querySelectorAll:()=>buttons},Date,Number,JSON,Error,Object,AbortController,question,toast:value=>notices.push(value),accessSerial:0,accessBusy:false,accessController:null,setTimeout:()=>1,clearTimeout:()=>{},fetch:async(url,options)=>{requests.push({url,options});return {ok:status>=200&&status<300,status,json:async()=>response};}});
  const start=code.indexOf('  const deepRequiresAccess='),end=code.indexOf('  function setSourceMode(');assert.ok(start>0&&end>start);
  vm.runInContext(code.slice(start,end)+'\nthis.openClinicalAccess=openClinicalAccess;this.hasClinicalAccess=hasClinicalAccess;',authContext);
  return {state:authState,fields,buttons,requests,notices,context:authContext,submit:()=>fields.accessForm.emit('submit',{preventDefault(){}})};
}

test('deep selection opens an empty password dialog and cancellation keeps basic without a network request',()=>{
  const h=accessHarness();h.buttons[1].emit('click');assert.equal(h.fields.accessDialog.open,true);assert.equal(h.fields.accessPin.value,'');assert.equal(h.state.answerStyle,'basic');
  h.fields.accessPin.value='temporary-user-input';h.fields.accessDialog.close();assert.equal(h.fields.accessPin.value,'');assert.equal(h.state.answerStyle,'basic');assert.equal(h.requests.length,0);
  const html=fs.readFileSync(path.join(__dirname,'../nbcare/index.html'),'utf8');assert.match(html,/id="accessPin"[^>]*type="password"/);assert.match(html,/Chuyên sâu dành cho nhân viên y tế/);
});

test('successful access keeps the token in memory and selects deep without automatically submitting any clinical question',async()=>{
  const h=accessHarness();h.buttons[1].emit('click');h.fields.accessPin.value='temporary-user-input';await h.submit();
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/access');assert.equal(JSON.parse(h.requests[0].options.body).pin,'temporary-user-input');
  assert.equal(h.state.answerStyle,'deep');assert.equal(h.state.accessToken,'opaque-session-token-for-test');assert.equal(h.fields.accessDialog.open,false);assert.equal(h.fields.accessPin.value,'');assert.equal(h.context.hasClinicalAccess(),true);
  assert.doesNotMatch(code,/localStorage|sessionStorage/);assert.ok(!h.notices.join(' ').includes(h.state.accessToken));
});

test('wrong access codes and rate limits do not open deep or echo the submitted code',async()=>{
  for(const status of [403,429]){const h=accessHarness({error:{message:'Do not expose server error details'}},status);h.buttons[1].emit('click');h.fields.accessPin.value='private-test-input';await h.submit();
    assert.equal(h.state.answerStyle,'basic');assert.equal(h.state.accessToken,null);assert.equal(h.fields.accessDialog.open,true);assert.equal(h.fields.accessPin.value,'');assert.equal(h.fields.accessError.hidden,false);assert.ok(!h.fields.accessError.textContent.includes('private-test-input'));assert.ok(!h.fields.accessError.textContent.includes('server error'));
  }
});

test('expired or malformed access sessions require authentication and never persist an invalid token',async()=>{
  const h=accessHarness({accessToken:'opaque-session-token-for-test',expiresAt:Date.now()-1});h.buttons[1].emit('click');h.fields.accessPin.value='input';await h.submit();assert.equal(h.state.accessToken,null);assert.equal(h.state.answerStyle,'basic');
  h.state.accessToken='old-session-token';h.state.accessExpiresAt=Date.now()-100;h.state.answerStyle='deep';h.buttons[1].emit('click');assert.equal(h.state.answerStyle,'basic');assert.equal(h.fields.accessDialog.open,true);
});

function readinessHarness(){
  let now=1000000,nextTimer=1;const timers=new Map(),requests=[],queue=[],classes=new Set();
  const dot={attributes:{},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},setAttribute(name,value){this.attributes[name]=value;}};
  const fields={connectionDot:dot,geminiOcr:{replaceChildren(){}},ocrPrivacy:{textContent:''}};
  const apiState={api:{configured:true,provider:'vertex-adk',model:'gemini-3.8-flash'},readiness:{ready:false,verifiedAt:0,expiresAt:0,model:null}};
  const nav={onLine:true},doc={visibilityState:'visible',createTextNode:value=>({textContent:value})};
  const response=(data,ok=true)=>({ok,json:async()=>data});
  const ready=()=>({ready:true,verifiedAt:now,expiresAt:now+300000,model:'gemini-3.8-flash'});
  const ctx=vm.createContext({state:apiState,$:id=>fields[id],navigator:nav,document:doc,Date:{now:()=>now},Number,Math,Error,AbortController,AbortSignal,readinessPromise:null,readinessController:null,readinessTimer:null,readinessRevision:0,lastReadinessAttemptAt:0,statusPromise:null,
    modelName:value=>typeof value==='string'&&/^gemini-[a-z0-9.-]+$/.test(value)?value:'',isLive:()=>Boolean(apiState.api?.configured&&apiState.api.provider!=='local-demo'),updateModelLabels(){},imageControls(){},
    setTimeout(fn,ms){const id=nextTimer++;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:async(url,options)=>{requests.push({url,options});const item=queue.shift();return typeof item==='function'?item():item||response(ready());}});
  const start=code.indexOf('  const READINESS_TTL_MS='),end=code.indexOf('  // Supported Markdown');assert.ok(start>0&&end>start);
  const statusStart=code.indexOf('  async function checkStatus('),statusEnd=code.indexOf('  function releaseCandidate(');assert.ok(statusStart>0&&statusEnd>statusStart);
  vm.runInContext(code.slice(start,end)+code.slice(statusStart,statusEnd)+'\nObject.assign(this,{acceptReadiness,recordAiResponse,checkReadiness,checkStatus,recheckWhenStale,invalidateReadiness,freshReadiness});',ctx);
  return {ctx,state:apiState,navigator:nav,document:doc,dot,classes,requests,queue,response,ready,now:()=>now,tick(ms){now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}};
}

test('configured status alone never turns the dot green and triggers only the actual readiness check',async()=>{
  const h=readinessHarness();let resolveProbe;const pending=new Promise(resolve=>{resolveProbe=resolve;});
  h.queue.push(h.response({configured:true,provider:'vertex-adk',model:'gemini-3.8-flash'}),()=>pending);
  const work=h.ctx.checkStatus();for(let i=0;i<30&&h.requests.length<2;i++)await Promise.resolve();
  assert.equal(h.state.api.configured,true);assert.equal(h.classes.has('is-live'),false);assert.deepEqual(h.requests.map(r=>r.url),['/api/status','/api/readiness']);
  resolveProbe(h.response({ready:false}));await work;assert.equal(h.classes.has('is-live'),false);assert.equal(h.dot.attributes['data-state'],'unavailable');
});

test('green requires a real ready result with a fresh numeric timestamp, expiry and model',()=>{
  const h=readinessHarness();for(const data of [{configured:true},{ready:true},{...h.ready(),verifiedAt:h.now()+6000},{...h.ready(),verifiedAt:h.now()-300001},{...h.ready(),expiresAt:h.now()},{...h.ready(),model:''},{...h.ready(),expiresAt:'not a timestamp'}]){
    assert.equal(h.ctx.acceptReadiness(data),false);assert.equal(h.classes.has('is-live'),false);
  }
  assert.equal(h.ctx.acceptReadiness(h.ready()),true);assert.equal(h.classes.has('is-live'),true);assert.equal(h.dot.attributes['data-state'],'ready');assert.match(h.dot.attributes['aria-label'],/đã được kiểm tra/);
});

test('readiness expiry changes only the indicator and never starts a paid background probe',()=>{
  const h=readinessHarness();assert.equal(h.ctx.acceptReadiness({...h.ready(),expiresAt:h.now()+5000}),true);
  h.tick(5001);assert.equal(h.classes.has('is-live'),false);assert.equal(h.state.readiness.ready,false);assert.equal(h.dot.attributes['data-state'],'expired');assert.equal(h.requests.length,0);
});

test('concurrent checks share one request and errors impose a retry gap without any automatic polling',async()=>{
  const h=readinessHarness();let finish;h.queue.push(()=>new Promise(resolve=>{finish=resolve;}));
  const one=h.ctx.checkReadiness(),two=h.ctx.checkReadiness();assert.equal(h.requests.length,1);
  finish(h.response({},false));await Promise.all([one,two]);assert.equal(h.classes.has('is-live'),false);assert.equal(h.dot.attributes['data-state'],'unavailable');
  await h.ctx.checkReadiness();assert.equal(h.requests.length,1);h.tick(30001);assert.equal(h.requests.length,1);
  await h.ctx.checkReadiness();assert.equal(h.requests.length,2);assert.equal(h.classes.has('is-live'),true);
});

test('offline and malformed readiness responses cannot retain a green indicator',async()=>{
  const h=readinessHarness();h.ctx.recordAiResponse('gemini-3.8-flash');assert.equal(h.classes.has('is-live'),true);
  h.navigator.onLine=false;await h.ctx.checkReadiness();assert.equal(h.classes.has('is-live'),false);assert.equal(h.requests.length,0);assert.equal(h.dot.attributes['data-state'],'offline');
  assert.equal(h.ctx.acceptReadiness(h.ready()),false);
  h.navigator.onLine=true;h.queue.push({ok:true,json:async()=>{throw new Error('Malformed response');}});await h.ctx.checkReadiness();assert.equal(h.classes.has('is-live'),false);assert.equal(h.dot.attributes['data-state'],'unavailable');
});

test('a late failed probe cannot erase newer evidence from an actual successful AI response',async()=>{
  const h=readinessHarness();let finish;h.queue.push(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=h.ctx.checkReadiness();h.ctx.recordAiResponse('gemini-3.1-pro-preview');finish(h.response({},false));await pending;
  assert.equal(h.classes.has('is-live'),true);assert.equal(h.state.readiness.model,'gemini-3.1-pro-preview');
});

test('visibility and online rechecks skip fresh proofs and hidden tabs while stale visible requests remain deduplicated',async()=>{
  const h=readinessHarness();h.ctx.acceptReadiness({...h.ready(),expiresAt:h.now()+5000});h.ctx.recheckWhenStale();assert.equal(h.requests.length,0);
  h.tick(5001);h.document.visibilityState='hidden';h.ctx.recheckWhenStale();assert.equal(h.requests.length,0);
  let finish;h.queue.push(()=>new Promise(resolve=>{finish=resolve;}));h.document.visibilityState='visible';h.ctx.recheckWhenStale();h.ctx.recheckWhenStale();assert.equal(h.requests.length,1);
  finish(h.response(h.ready()));for(let i=0;i<20;i++)await Promise.resolve();assert.equal(h.classes.has('is-live'),true);
});

test('deterministic help has copy-only actions without a missing-evidence badge or empty source button',()=>{
  const start=code.indexOf('  function finishMessage('),end=code.indexOf('  const resizeInput=');assert.ok(start>0&&end>start);
  context.icon=()=>el('svg');context.state={reply:null};context.modelName=value=>typeof value==='string'?value:'';context.showSources=()=>{};context.scrollToLatest=()=>{};context.openClinicalAccess=()=>{};
  vm.runInContext(code.slice(start,end)+'\nthis.finishMessage=finishMessage;',context);
  const message={content:el('div'),meta:el('div'),body:el('div')};message.body.append(message.meta,message.content);
  context.finishMessage(message,{text:'Tôi có thể giúp bạn tra cứu thông tin thuốc.',provider:'vertex-adk',status:'help',grounded:false,sources:[],model:'gemini-offline-fixture'});
  assert.deepEqual(all(message.body).filter(n=>n.tagName==='button').map(n=>n.textContent),['Sao chép']);assert.ok(!message.meta.textContent.includes('Chưa đủ căn cứ'));assert.ok(!message.meta.textContent.includes('Demo'));assert.doesNotMatch(message.meta.textContent,/Gemini|gemini|offline-fixture/);
});

test('the welcome contains only the requested introduction and the status has no visible connection label or suggestions',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../nbcare/index.html'),'utf8');
  assert.ok(html.includes('Xin chào Quý Lãnh đạo, Bác sĩ &amp; Dược sĩ!'));assert.ok(html.includes('Trợ lý Dược lâm sàng AI NB CARE'));assert.ok(html.includes("Nelson's 2026"));
  assert.doesNotMatch(html,/technology-label|modelSummaryMobile|Tên model|Vertex AI|Gemini/);assert.doesNotMatch(code,/updateModelLabels|model-message-tag/);
  assert.doesNotMatch(html,/connectionLabel|data-prompt|suggestion-grid|Thử đọc ảnh mẫu/);assert.doesNotMatch(code,/connectionLabel|data-prompt|sampleButton|ocr-sample\.svg/);
  assert.match(html,/id="connectionDot"[^>]*role="status"[^>]*aria-label=/);assert.match(html,/20261029release/);assert.doesNotMatch(html,/20261029preview|Điều hướng bản demo/);assert.match(html,/Điều hướng DrugView/);
  for(const id of ['openCamera','uploadImage','accessDialog','accessPin'])assert.ok(html.includes(`id="${id}"`));
});
