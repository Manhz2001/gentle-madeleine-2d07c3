(() => {
  'use strict';
  const moduleBase = new URL('.', document.currentScript.src);
  const embedded = new URLSearchParams(location.search).get('embed') === '1' || window.self !== window.top;
  if (embedded) document.documentElement.classList.add('is-embedded');
  const $ = id => document.getElementById(id);
  const state = {sourceMode:'closed',answerStyle:'basic',busy:false,serial:0,history:[],reply:null,attachment:null,candidate:null,imageSerial:0,ocrBusy:false,nearBottom:true,api:null,accessToken:null,accessExpiresAt:0,readiness:{ready:false,verifiedAt:0,expiresAt:0,model:null}};
  const chat = $('chatDialog'), scroller = $('messageScroll'), question = $('question');
  let requestController, ocrRequestController, accessController, accessSerial=0, accessBusy=false, readinessPromise, readinessController, readinessTimer, readinessRevision=0, lastReadinessAttemptAt=0, statusPromise, cameraStream, cameraSerial=0, workerPromise, workerInstance, toastTimer, lastTrigger;
  const icon = name => { const s=document.createElementNS('http://www.w3.org/2000/svg','svg'); const u=document.createElementNS(s.namespaceURI,'use');u.setAttribute('href',`#i-${name}`);s.append(u);s.setAttribute('aria-hidden','true');return s; };
  const el = (tag,cls,text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  const modelName = value => typeof value==='string'&&/^gemini-[a-z0-9.-]+$/.test(value)?value.replace(/^gemini-/,'Gemini '):'';
  function updateModelLabels(){
    const basic=modelName(state.api?.models?.basic||state.api?.model),deep=modelName(state.api?.models?.deep);
    const summary=[basic&&`Cơ bản: ${basic}`,deep&&`Chuyên sâu: ${deep}`].filter(Boolean).join(' · ');
    document.querySelector('.technology-label').textContent=summary||'Vertex AI · Gemini';
    document.querySelector('.technology-label').title=summary;
    $('modelSummaryMobile').textContent=summary||'Tên model sẽ hiển thị khi máy chủ sẵn sàng.';
    document.querySelectorAll('[data-style]').forEach(button=>{const value=button.dataset.style==='deep'?deep:basic;button.title=[button.dataset.style==='deep'?'Chuyên sâu dành cho nhân viên y tế':'',value].filter(Boolean).join(' · ');});
  }

  const READINESS_TTL_MS=5*60*1000,READINESS_RETRY_GAP_MS=30000;
  const freshReadiness=()=>state.readiness?.ready===true&&Date.now()<state.readiness.expiresAt&&navigator.onLine!==false;
  function renderReadiness(label='Chưa xác nhận kết nối AI',kind='unverified'){
    const dot=$('connectionDot'),ready=freshReadiness();dot.classList.toggle('is-live',ready);dot.classList.toggle('is-unavailable',!ready&&kind==='unavailable');dot.setAttribute('data-state',ready?'ready':kind);dot.setAttribute('aria-label',ready?'AI đã được kiểm tra và sẵn sàng trả lời':label);dot.title=ready?'Đã nhận phản hồi AI gần đây':label;
  }
  function invalidateReadiness(label='Chưa xác nhận kết nối AI',kind='unverified'){
    readinessRevision++;clearTimeout(readinessTimer);state.readiness={ready:false,verifiedAt:0,expiresAt:0,model:null};renderReadiness(label,kind);
  }
  function acceptReadiness(data){
    const now=Date.now(),verifiedAt=data?.verifiedAt,expiresAt=data?.expiresAt;
    if(data?.ready!==true||typeof verifiedAt!=='number'||typeof expiresAt!=='number'||!Number.isFinite(verifiedAt)||!Number.isFinite(expiresAt)||verifiedAt>now+5000||verifiedAt<=0||expiresAt<=now||expiresAt<=verifiedAt||now-verifiedAt>=READINESS_TTL_MS||!modelName(data.model)||navigator.onLine===false)return false;
    readinessRevision++;clearTimeout(readinessTimer);state.readiness={ready:true,verifiedAt,expiresAt:Math.min(expiresAt,verifiedAt+READINESS_TTL_MS),model:data.model};renderReadiness();
    readinessTimer=setTimeout(()=>{if(!freshReadiness())invalidateReadiness('Cần kiểm tra lại kết nối AI','expired');},Math.max(1,state.readiness.expiresAt-now));return true;
  }
  function recordAiResponse(model){const now=Date.now();acceptReadiness({ready:true,verifiedAt:now,expiresAt:now+READINESS_TTL_MS,model});}
  async function checkReadiness(){
    if(freshReadiness())return true;if(state.readiness?.ready)renderReadiness('Cần kiểm tra lại kết nối AI','expired');if(readinessPromise)return readinessPromise;
    if(navigator.onLine===false){invalidateReadiness('Thiết bị đang ngoại tuyến','offline');return false;}
    if(!isLive()){invalidateReadiness();return false;}
    const now=Date.now();if(lastReadinessAttemptAt&&now-lastReadinessAttemptAt<READINESS_RETRY_GAP_MS)return false;lastReadinessAttemptAt=now;
    const revision=readinessRevision,controller=new AbortController();readinessController=controller;renderReadiness('Đang kiểm tra khả năng trả lời của AI','checking');const timer=setTimeout(()=>controller.abort(),12000);
    const promise=(async()=>{try{const response=await fetch('/api/readiness',{signal:controller.signal});if(!response.ok)throw new Error('readiness');const data=await response.json();if(revision!==readinessRevision)return freshReadiness();if(!acceptReadiness(data)){invalidateReadiness('Chưa xác nhận khả năng trả lời của AI','unavailable');return false;}return true;
      }catch{if(revision===readinessRevision)invalidateReadiness('Chưa xác nhận kết nối AI','unavailable');return false;}
      finally{clearTimeout(timer);if(readinessController===controller){readinessController=null;readinessPromise=null;}}})();readinessPromise=promise;return promise;
  }
  function recheckWhenStale(){if(freshReadiness()||document.visibilityState==='hidden')return;if(isLive())checkReadiness();else checkStatus();}

  // Supported Markdown is built as DOM nodes. Model text is never treated as HTML.
  function renderMarkdown(text,sources=[]){
    const known=new Map(sources.map(s=>[s.id,s])),urls=new Set(sources.map(s=>s.url));
    function inline(parent,value,depth=0){
      if(depth>3){parent.append(document.createTextNode(value));return;}
      const pattern=/\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\[([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)\]/g;let position=0,match;
      while((match=pattern.exec(value))){
        parent.append(document.createTextNode(value.slice(position,match.index)));
        if(match[1]){const strong=el('strong');inline(strong,match[1],depth+1);parent.append(strong);}
        else if(match[2])parent.append(el('code','',match[2]));
        else if(match[3]){if(urls.has(match[4])){const a=el('a','citation-link',match[3]);a.href=match[4];a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}else parent.append(document.createTextNode(match[3]));}
        else {const ids=match[5].split(/\s*,\s*/);if(ids.every(id=>known.has(id))){parent.append(document.createTextNode('['));ids.forEach((id,i)=>{if(i)parent.append(document.createTextNode(', '));const source=known.get(id),a=el('a','citation-link',id);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';a.title=source.citation||source.title;parent.append(a);});parent.append(document.createTextNode(']'));}else parent.append(document.createTextNode(match[0]));}
        position=pattern.lastIndex;
      }
      parent.append(document.createTextNode(value.slice(position)));
    }
    function tableRow(line){
      const value=line.trim(),cells=[];let cell='',ticks=0;
      for(let i=0;i<value.length;i++){
        if(value[i]==='`'){let count=1;while(value[i+count]==='`')count++;if(!ticks)ticks=count;else if(count===ticks)ticks=0;cell+=value.slice(i,i+count);i+=count-1;continue;}
        if(value[i]==='|'){
          const slashes=cell.match(/\\+$/)?.[0].length||0;
          if(slashes%2){cell=cell.slice(0,-1)+'|';continue;}
          if(!ticks){cells.push(cell.trim());cell='';continue;}
        }
        cell+=value[i];
      }
      cells.push(cell.trim());if(value.startsWith('|')&&cells[0]==='')cells.shift();if(cells.length>1&&cells[cells.length-1]===''&&value.endsWith('|'))cells.pop();
      return cells.length>=2?cells:null;
    }
    function tableDefinition(lines,index){
      if(index+1>=lines.length)return null;
      const headers=tableRow(lines[index]),dividers=tableRow(lines[index+1]);
      if(!headers||headers.length>8||!dividers||headers.length!==dividers.length||!dividers.every(value=>/^:?-{3,}:?$/.test(value)))return null;
      return {headers,align:dividers.map(value=>value.startsWith(':')&&value.endsWith(':')?'is-centered':value.endsWith(':')?'is-right-aligned':'')};
    }
    function blocks(lines,depth=0){
      const fragment=document.createDocumentFragment();let index=0;
      const boundary=(line,at)=>/^\s*(?:#{1,6}\s|>\s?|[-*+]\s+|\d+[.)]\s+)/.test(line)||Boolean(tableDefinition(lines,at));
      while(index<lines.length){
        const line=lines[index];if(!line.trim()){index++;continue;}
        const definition=tableDefinition(lines,index);
        if(definition){
          const wrap=el('div','markdown-table-wrap'),table=el('table','reference-table'),caption=el('caption','visually-hidden','Bảng tham khảo trong câu trả lời'),head=el('thead'),headRow=el('tr'),body=el('tbody');
          wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Bảng tham khảo trong câu trả lời');wrap.tabIndex=0;
          definition.headers.forEach((value,column)=>{const cell=el('th',definition.align[column]);cell.setAttribute('scope','col');inline(cell,value);headRow.append(cell);});head.append(headRow);index+=2;
          let rowCount=0;
          while(index<lines.length&&rowCount<50){const values=tableRow(lines[index]);if(!values||values.length!==definition.headers.length)break;const row=el('tr');values.forEach((value,column)=>{const cell=el('td',definition.align[column]);inline(cell,value);row.append(cell);});body.append(row);index++;rowCount++;}
          table.append(caption,head,body);wrap.append(table);fragment.append(wrap);continue;
        }
        const heading=line.match(/^\s*(#{1,6})\s+(.+)$/);
        if(heading){const node=el('h'+Math.max(3,Math.min(4,heading[1].length)));inline(node,heading[2]);fragment.append(node);index++;continue;}
        if(/^\s*>/.test(line)&&depth<3){const quoteLines=[];while(index<lines.length&&/^\s*>/.test(lines[index]))quoteLines.push(lines[index++].replace(/^\s*>\s?/,''));const value=quoteLines.join('\n'),kind=value.includes('🔴')?'is-critical':value.includes('🟡')?'is-caution':value.includes('🟢')?'is-suitable':'';const quote=el('blockquote',`clinical-callout ${kind}`.trim());quote.append(blocks(quoteLines,depth+1));fragment.append(quote);continue;}
        const bullet=line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
        if(bullet){const ordered=/^\d/.test(bullet[1]),list=el(ordered?'ol':'ul');while(index<lines.length){const item=lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);if(!item||/^\d/.test(item[1])!==ordered)break;const li=el('li');inline(li,item[2]);list.append(li);index++;}fragment.append(list);continue;}
        const paragraph=el('p');do{if(paragraph.childNodes.length)paragraph.append(document.createElement('br'));inline(paragraph,lines[index++]);}while(index<lines.length&&lines[index].trim()&&!boundary(lines[index],index));fragment.append(paragraph);
      }
      return fragment;
    }
    return blocks(String(text).replace(/\r\n?/g,'\n').split('\n'));
  }
  const modeName = mode => mode==='open'?'Nguồn mở':'Nguồn đóng';
  const modeIcon = mode => mode==='open'?'globe':'lock';
  const isLive = () => Boolean(state.api?.configured && state.api?.provider!=='local-demo' && state.api?.demo!==true);
  const toast = text => {clearTimeout(toastTimer);$('toast').textContent=text;chat.append($('toast'));$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);};

  function openChat(trigger) {lastTrigger=trigger||document.activeElement;if(!chat.open){if(embedded)chat.open=true;else chat.showModal();}requestAnimationFrame(()=>{if(!embedded&&window.innerWidth>960&&!window.matchMedia('(pointer: coarse)').matches)question.focus({preventScroll:true});});}
  document.querySelectorAll('[data-open-chat]').forEach(b=>b.addEventListener('click',()=>openChat(b)));
  $('closeChat').addEventListener('click',()=>chat.close());
  chat.addEventListener('cancel',event=>{if(embedded)event.preventDefault();});
  chat.addEventListener('close',()=>{lastTrigger?.focus?.({preventScroll:true});});
  $('expandChat').addEventListener('click',()=>{const on=chat.classList.toggle('is-full');$('expandChat').setAttribute('aria-pressed',String(on));$('expandChat').setAttribute('aria-label',on?'Thu gọn khung chat':'Mở rộng khung chat');});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  $('mobileConfig').addEventListener('click',()=>$('configDialog').showModal());
  document.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',()=>setSourceMode(b.dataset.source)));
  const deepRequiresAccess=()=>state.api?.access?.deepRequiresCode!==false;
  const hasClinicalAccess=()=>Boolean(state.accessToken&&Date.now()<state.accessExpiresAt);
  function setAnswerStyle(style){state.answerStyle=style==='deep'?'deep':'basic';document.querySelectorAll('[data-style]').forEach(n=>{const active=n.dataset.style===state.answerStyle;n.classList.toggle('is-active',active);n.setAttribute('aria-pressed',String(active));});}
  function openClinicalAccess(){if(!deepRequiresAccess()||hasClinicalAccess()){setAnswerStyle('deep');return;}setAnswerStyle('basic');$('accessError').hidden=true;$('accessPin').value='';if(!$('accessDialog').open)$('accessDialog').showModal();$('accessPin').focus();}
  document.querySelectorAll('[data-style]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.style==='deep')openClinicalAccess();else setAnswerStyle('basic');}));
  $('accessDialog').addEventListener('close',()=>{accessSerial++;accessController?.abort();accessController=null;accessBusy=false;$('accessPin').value='';$('accessPin').disabled=false;$('accessSubmit').disabled=false;$('accessSubmit').textContent='Mở chế độ Chuyên sâu';question.focus({preventScroll:true});});
  $('accessForm').addEventListener('submit',async event=>{
    event.preventDefault();if(accessBusy)return;const pin=$('accessPin').value.trim();if(!pin)return;
    const serial=++accessSerial,controller=new AbortController();accessController=controller;accessBusy=true;$('accessError').hidden=true;$('accessPin').disabled=true;$('accessSubmit').disabled=true;$('accessSubmit').textContent='Đang xác thực…';const timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin}),signal:controller.signal});const data=await response.json();if(serial!==accessSerial||!$('accessDialog').open)return;
      if(!response.ok)throw Object.assign(new Error('access'),{status:response.status});
      let expiresAt=typeof data.expiresAt==='number'?data.expiresAt:Date.parse(data.expiresAt);if(expiresAt>0&&expiresAt<1e12)expiresAt*=1000;
      if(typeof data.accessToken!=='string'||data.accessToken.length<16||data.accessToken.length>4096||/\s/.test(data.accessToken)||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error('access');
      state.accessToken=data.accessToken;state.accessExpiresAt=expiresAt;setAnswerStyle('deep');$('accessDialog').close();toast('Đã mở Chuyên sâu. Bạn có thể kiểm tra câu hỏi rồi bấm gửi.');
    }catch(error){if(serial!==accessSerial)return;$('accessError').textContent=error.status===429?'Bạn đã thử nhiều lần. Vui lòng chờ rồi thử lại.':error.status===403||error.status===401?'Mã truy cập chưa đúng. Vui lòng kiểm tra lại.':'Chưa xác thực được quyền truy cập. Vui lòng thử lại.';$('accessError').hidden=false;$('accessPin').value='';}
    finally{clearTimeout(timer);if(serial===accessSerial){accessBusy=false;accessController=null;$('accessPin').disabled=false;$('accessSubmit').disabled=false;$('accessSubmit').textContent='Mở chế độ Chuyên sâu';if($('accessDialog').open)$('accessPin').focus();}}
  });

  function setSourceMode(mode) {
    state.sourceMode=mode==='open'?'open':'closed';
    document.querySelectorAll('[data-source]').forEach(n=>{const active=n.dataset.source===state.sourceMode;n.classList.toggle('is-active',active);n.setAttribute('aria-pressed',String(active));});
    $('modeCaption').textContent=modeName(state.sourceMode);
    document.querySelectorAll('.mobile-source-name').forEach(n=>{n.textContent=modeName(state.sourceMode);});
    $('composerMode').replaceChildren(icon(modeIcon(mode)),document.createTextNode(modeName(mode)));
    if($('configDialog').open)$('configDialog').close();
  }

  function safeSources(sources) {
    if(!Array.isArray(sources))return [];
    const seen=new Set();return sources.slice(0,10).flatMap((s,i)=>{try{const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||seen.has(u.href))return [];seen.add(u.href);return [{id:String(s.id||`S${i+1}`).slice(0,64),title:String(s.title||u.hostname).slice(0,300),citation:typeof s.citation==='string'?s.citation.slice(0,800):'',limitations:typeof s.limitations==='string'?s.limitations.slice(0,1200):'',url:u.href,origin:['internal','closed'].includes(s.origin)?'internal':'external',provenance:['published_drugview','approved_local','official_dailymed','pubmed_abstract'].includes(s.provenance)?s.provenance:null}];}catch{return [];}});
  }
  function evidenceNodes(reply=state.reply) {
    const fragment=document.createDocumentFragment();
    if(reply){
      fragment.append(el('p','evidence-result-mode',`${modeName(reply.sourceMode)} · Căn cứ của câu trả lời đã chọn`));
      if(reply.provider==='local-demo'||reply.status==='demo')fragment.append(el('strong','evidence-result-title','Chưa có câu trả lời AI'));
      else fragment.append(el('strong','evidence-result-title',reply.grounded&&reply.sources.length?'Có tài liệu kèm theo':'Chưa đủ căn cứ được kiểm chứng'));
      if(reply.sources.length){for(const s of reply.sources){const a=el('a','evidence-source');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';const originLabel=s.provenance==='published_drugview'?'Danh mục DrugView đã xuất bản':s.provenance==='official_dailymed'?'NLM/DailyMed · Nhãn SPL Hoa Kỳ':s.provenance==='pubmed_abstract'?'PubMed · Tóm tắt bài báo':s.origin==='internal'?'Kho tài liệu được duyệt':'Nguồn bên ngoài';a.append(el('strong','',s.title));if(s.citation)a.append(el('span','',s.citation));a.append(el('span','',`${originLabel} · ${new URL(s.url).hostname} ↗`));if(s.limitations)a.append(el('p','evidence-note',s.limitations));fragment.append(a);}return fragment;}
    }
    const empty=el('div','evidence-state');empty.append(icon(reply?'book':modeIcon(state.sourceMode)));
    const drugview=state.api?.closedSource;
    empty.append(el('strong','',reply?'Chưa có tài liệu trích dẫn':state.sourceMode==='closed'?(drugview?.lastFetchFailed?'Chưa lấy được dữ liệu mới':drugview?.loaded?'Đã nạp danh mục DrugView':drugview?.configured?'Nguồn DrugView đã cấu hình':'Kho tài liệu chưa được nạp'):'Tra cứu thêm nguồn chính thống'));
    empty.append(el('p','',reply?'Chỉ các tài liệu thực sự do máy chủ trả về mới xuất hiện ở đây.':state.sourceMode==='closed'?(drugview?.configured?'Tra cứu dữ liệu đã xuất bản trên DrugView và tài liệu bệnh viện được cung cấp. Không tự bổ sung thông tin còn trống.':'Kho nguồn chưa sẵn sàng để trả lời câu hỏi có căn cứ. Vui lòng thử lại sau.'):'Chỉ hiển thị đoạn tài liệu thực sự truy xuất từ các kênh đã cấu hình; không dùng tài liệu từ trí nhớ mô hình.'));
    fragment.append(empty,el('p','evidence-label','KÊNH TÀI LIỆU ĐƯỢC CẤU HÌNH'));
    const list=el('ol','priority-list');
    [['DrugView & tài liệu bệnh viện','Ưu tiên dữ liệu đã xuất bản và tài liệu được bệnh viện cung cấp'],['NLM / DailyMed','Nhãn SPL Hoa Kỳ; không đồng nhất với hướng dẫn được duyệt tại Việt Nam'],['PubMed','Tóm tắt bài báo; không dùng một mình để quyết định đổi thuốc hoặc liều']].forEach(([t,d],i)=>{const li=el('li');const body=el('div');body.append(el('strong','',t),el('small','',d));li.append(el('span','priority-number',String(i+1)),body);list.append(li);});
    fragment.append(list,el('p','evidence-note','Đây là các kênh được cấu hình, không phải danh sách tài liệu đã dùng trong câu trả lời. Tài liệu chỉ được trích dẫn khi thực sự truy xuất được. Ảnh và văn bản bạn gửi không được xem là hướng dẫn chuyên môn đã duyệt.'));
    return fragment;
  }
  function showSources(reply=state.reply){if(reply)state.reply=reply;$('sourceDialogContent').replaceChildren(evidenceNodes(reply));$('sourcesDialog').showModal();}

  function scrollToLatest(force=false) {if(force||state.nearBottom){requestAnimationFrame(()=>{scroller.scrollTop=scroller.scrollHeight;$('newMessageBadge').hidden=true;});}else $('newMessageBadge').hidden=false;}
  scroller.addEventListener('scroll',()=>{state.nearBottom=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<90;if(state.nearBottom)$('newMessageBadge').hidden=true;});
  $('newMessageBadge').addEventListener('click',()=>scrollToLatest(true));
  function messageNode(role,text,mode,style,ocr=false){
    $('welcome').hidden=true;
    const root=el('article',`message ${role}`),avatar=el('div','message-avatar');avatar.append(role==='user'?document.createTextNode('B'):icon('plus'));
    const body=el('div','message-body'),meta=el('div','message-meta');meta.append(el('strong','',role==='user'?'Bạn':'NBCare'),el('span','',modeName(mode)));
    if(role!=='user')meta.append(el('span','',style==='deep'?'Chuyên sâu':'Cơ bản'));
    const content=el('div','message-text',text);body.append(meta);
    if(ocr)body.append(el('p','message-ocr-note','Có nội dung OCR đã được bạn kiểm tra'));
    body.append(content);root.append(avatar,body);$('messages').append(root);scrollToLatest(role==='user');return {root,body,meta,content};
  }
  function pendingNode(mode,style){const m=messageNode('assistant','',mode,style);const dots=el('div','thinking');dots.setAttribute('role','status');dots.append(el('i'),el('i'),el('i'),el('span','',isLive()?'Đang tìm thông tin và chuẩn bị câu trả lời…':'Đang tìm thông tin và chuẩn bị câu trả lời…'));m.content.replaceChildren(dots);return m;}
  function finishMessage(m,reply) {
    m.content.classList.add('markdown-answer');m.content.replaceChildren(renderMarkdown(reply.text,reply.sources));
    if(modelName(reply.model))m.meta.append(el('span','model-message-tag',modelName(reply.model)));
    if(reply.provider==='local-demo'||reply.status==='demo')m.meta.append(el('span','demo-message-tag','AI chưa kết nối'));
    else if(!reply.grounded&&reply.status!=='help'&&reply.referral!==true)m.meta.append(el('span','demo-message-tag','Chưa đủ căn cứ'));
    const actions=el('div','message-actions'),copy=el('button');copy.type='button';copy.append(icon('copy'),document.createTextNode('Sao chép'));
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(reply.text);toast('Đã sao chép câu trả lời.');}catch{toast('Trình duyệt chưa cho phép sao chép. Bạn có thể chọn văn bản để sao chép.');}});
    actions.append(copy);if(reply.status!=='help'&&reply.referral!==true){const sourceButton=el('button');sourceButton.type='button';sourceButton.append(icon('book'),document.createTextNode(reply.sources.length?`${reply.sources.length} nguồn`:'Xem căn cứ'));sourceButton.addEventListener('click',()=>showSources(reply));actions.append(sourceButton);}m.body.append(actions);
    if(reply.sources.length){const chips=el('div','answer-sources');reply.sources.forEach(s=>{const a=el('a','source-chip',`[${s.id}] ${s.citation||s.title}`);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.title=s.citation||s.title;chips.append(a);});m.body.append(chips);}
    if(reply.referral===true){const enter=el('button','clinical-access-button','Vào Chuyên sâu dành cho nhân viên y tế');enter.type='button';enter.addEventListener('click',openClinicalAccess);m.body.append(enter);}
    state.reply=reply;scrollToLatest();
  }
  const resizeInput=()=>{question.style.height='auto';question.style.height=Math.min(question.scrollHeight,144)+'px';updateSend();};
  function updateSend(){$('sendMessage').disabled=state.busy||(!question.value.trim()&&!state.attachment);$('sendMessage').setAttribute('aria-label',state.busy?'Đang xử lý câu hỏi':'Gửi câu hỏi');}
  question.addEventListener('input',resizeInput);question.addEventListener('keydown',e=>{const touchTyping=window.matchMedia('(pointer: coarse) and (max-width: 960px)').matches;if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&(!touchTyping||e.ctrlKey||e.metaKey)){e.preventDefault();if(!$('sendMessage').disabled)$('chatForm').requestSubmit();}});

  $('chatForm').addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy)return;
    const raw=question.value.trim(),attachment=state.attachment;if(!raw&&!attachment)return;
    if(state.answerStyle==='deep'&&deepRequiresAccess()&&!hasClinicalAccess()){setAnswerStyle('basic');openClinicalAccess();return;}
    const message=raw||'Giúp tôi tìm thông tin từ nội dung ảnh đã kiểm tra.',mode=state.sourceMode,style=state.answerStyle;
    const id=++state.serial;state.busy=true;updateSend();$('chatError').hidden=true;
    const user=messageNode('user',message,mode,style,Boolean(attachment));const pending=pendingNode(mode,style);question.value='';resizeInput();$('threadCaption').textContent='Hội thoại hiện tại';
    const history=state.history.filter(h=>h.sourceMode===mode).slice(-6).map(({role,text})=>({role,text:text.slice(0,4000)}));
    const controller=new AbortController();requestController=controller;const timeout=setTimeout(()=>controller.abort(),85000);
    try{
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,sourceMode:mode,answerStyle:style,history,ocrText:attachment?.text||'',...(style==='deep'&&state.accessToken?{accessToken:state.accessToken}:{})}),signal:controller.signal});
      const data=await response.json();if(id!==state.serial)return;
      if(response.status===403&&data.error?.code==='CLINICAL_ACCESS_REQUIRED'){state.accessToken=null;state.accessExpiresAt=0;setAnswerStyle('basic');pending.root.remove();user.meta.append(el('span','demo-message-tag','Cần quyền truy cập'));if(!question.value)question.value=raw;$('chatError').textContent='Vui lòng xác thực để dùng Chuyên sâu. Câu hỏi và ảnh đã được giữ lại.';$('chatError').hidden=false;openClinicalAccess();return;}
      if(!response.ok)throw new Error('request');
      if(typeof data.text!=='string'||!data.text.trim())throw new Error('empty');
      const reply={...data,text:data.text,sourceMode:mode,sources:safeSources(data.sources),grounded:data.grounded===true};finishMessage(pending,reply);
      state.history.push({role:'user',text:message,sourceMode:mode},{role:'assistant',text:reply.text,sourceMode:mode});state.history=state.history.slice(-16);
      if(data.provider==='vertex-adk'&&modelName(data.model))recordAiResponse(data.model);
    }catch(error){if(id!==state.serial)return;invalidateReadiness('Chưa xác nhận kết nối AI','unavailable');pending.root.remove();user.meta.append(el('span','demo-message-tag','Gửi chưa thành công'));if(!question.value)question.value=raw;$('chatError').textContent=controller.signal.aborted?'Yêu cầu đã hết thời gian chờ. Bản nháp được giữ để bạn gửi lại.':'Chưa nhận được phản hồi từ máy chủ. Vui lòng thử lại sau.';$('chatError').hidden=false;}
    finally{clearTimeout(timeout);if(id===state.serial){state.busy=false;requestController=null;resizeInput();}}
  });

  async function checkStatus(){
    if(statusPromise)return statusPromise;
    const promise=(async()=>{try{const response=await fetch('/api/status',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const data=await response.json();state.api=data;updateModelLabels();if(isLive()){$('geminiOcr').replaceChildren(document.createTextNode('Đọc lại bằng Gemini'));$('ocrPrivacy').textContent='Bấm “Đọc lại bằng Gemini” sẽ gửi ảnh này đến Vertex AI. Hãy ẩn thông tin cá nhân không cần thiết.';imageControls();await checkReadiness();}else invalidateReadiness();}
      catch{invalidateReadiness('Chưa xác nhận kết nối AI','unavailable');}finally{statusPromise=null;}})();statusPromise=promise;return promise;
  }

  function releaseCandidate(){if(state.candidate?.url&&state.candidate.url!==state.attachment?.url)URL.revokeObjectURL(state.candidate.url);state.candidate=null;}
  function stopOcr(){state.imageSerial++;state.ocrBusy=false;ocrRequestController?.abort();ocrRequestController=null;const w=workerInstance;workerInstance=null;workerPromise=null;if(w)w.terminate().catch(()=>{});}
  function abandonImage(){stopOcr();releaseCandidate();if($('imageDialog').open)$('imageDialog').close();}
  function imageControls(){const ready=Boolean(state.candidate&&$('ocrText').value.trim())&&!state.ocrBusy;$('confirmImage').disabled=!ready;$('geminiOcr').disabled=state.ocrBusy||!isLive()||!state.candidate?.blob;$('ocrText').readOnly=state.ocrBusy;}
  function setOcrStatus(text,kind=''){$('ocrStatus').textContent=text;$('ocrStatus').className=`ocr-status ${kind==='loading'?'is-loading':kind==='error'?'is-error':''}`;imageControls();}
  async function getWorker(){
    if(workerInstance)return workerInstance;
    if(!window.Tesseract)throw new Error('missing-reader');
    if(!workerPromise){const p=Tesseract.createWorker('vie+eng',1,{workerPath:new URL('assets/ocr/worker.min.js',moduleBase).href,corePath:new URL('assets/ocr/core',moduleBase).href,langPath:new URL('assets/ocr/lang',moduleBase).href,gzip:false,workerBlobURL:false,logger:()=>{}});workerPromise=p;const w=await p;if(workerPromise!==p){await w.terminate();throw new Error('cancelled');}workerInstance=w;return w;}
    return workerPromise;
  }
  async function normalizeImage(file){
    if(file.size>12*1024*1024)throw new Error('size');
    const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth||!img.naturalHeight)throw new Error('format');const scale=Math.min(1.6,2200/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));if(!blob||blob.size>2*1024*1024)throw new Error('size');return blob;}finally{URL.revokeObjectURL(url);}
  }
  async function readImage(file){
    if(!file)return;if(state.ocrBusy)stopOcr();releaseCandidate();const id=++state.imageSerial;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Chọn ảnh JPG, PNG hoặc WebP. Với ảnh HEIC, hãy chuyển sang JPG trước.');return;}
    state.candidate={blob:null,url:null,name:file.name||'Ảnh chụp',text:'',uncertain:true};$('ocrText').value='';$('reviewImage').removeAttribute('src');$('imageName').textContent=file.name||'Ảnh chụp';state.ocrBusy=true;setOcrStatus('Đang chuẩn bị ảnh…','loading');if(!$('imageDialog').open)$('imageDialog').showModal();
    try{const blob=await normalizeImage(file);if(id!==state.imageSerial)return;const url=URL.createObjectURL(blob);state.candidate={blob,url,name:file.name||'Ảnh chụp',text:'',uncertain:false};$('reviewImage').src=url;
      setOcrStatus('Đang chuẩn bị bộ đọc chữ trên máy…','loading');const worker=await getWorker();if(id!==state.imageSerial)return;
      setOcrStatus('Đang đọc nội dung ảnh…','loading');const result=await worker.recognize(blob);if(id!==state.imageSerial)return;
      const text=String(result.data?.text||'').trim();if(text.length>12000){state.ocrBusy=false;setOcrStatus('Ảnh có quá nhiều nội dung cho một lượt. Hãy chụp từng phần; hệ thống không tự cắt bỏ nội dung.','error');return;}state.candidate.text=text;state.candidate.uncertain=Number(result.data?.confidence||0)<75;state.ocrBusy=false;$('ocrText').value=text;
      setOcrStatus(text?(state.candidate.uncertain?'Có nội dung chưa rõ. Hãy đối chiếu và sửa lại với ảnh gốc.':'Đã đọc xong. Hãy kiểm tra nội dung trước khi sử dụng.'):'Chưa đọc được chữ rõ ràng. Bạn có thể nhập lại hoặc chọn ảnh khác.',text?'':'error');
    }catch{if(id!==state.imageSerial)return;state.ocrBusy=false;setOcrStatus('Không đọc được ảnh. Thử ảnh rõ hơn hoặc nhập lại nội dung nhìn thấy.','error');}
  }
  $('uploadImage').addEventListener('click',()=>$('imageFile').click());
  $('imageFile').addEventListener('change',()=>{readImage($('imageFile').files[0]);$('imageFile').value='';});
  $('cameraFile').addEventListener('change',()=>{readImage($('cameraFile').files[0]);$('cameraFile').value='';});
  $('ocrText').addEventListener('input',imageControls);$('cancelImage').addEventListener('click',abandonImage);$('discardImage').addEventListener('click',abandonImage);
  $('imageDialog').addEventListener('cancel',()=>{stopOcr();releaseCandidate();});
  $('confirmImage').addEventListener('click',()=>{const text=$('ocrText').value.trim();if(!text||state.ocrBusy||!state.candidate)return;
    if(state.attachment?.url&&state.attachment.url!==state.candidate.url)URL.revokeObjectURL(state.attachment.url);state.attachment={...state.candidate,text};state.candidate=null;$('imageDialog').close();renderAttachment();question.focus();});
  function renderAttachment(){$('attachedOcr').hidden=!state.attachment;if(state.attachment){$('ocrCharacterCount').textContent=`${state.attachment.text.length} ký tự`;$('editOcr').textContent='Nội dung từ ảnh đã xác nhận';}updateSend();}
  $('removeAttachment').addEventListener('click',()=>{if(state.attachment?.url)URL.revokeObjectURL(state.attachment.url);state.attachment=null;renderAttachment();});
  $('editOcr').addEventListener('click',()=>{if(!state.attachment)return;state.candidate={...state.attachment};if(state.candidate.url)$('reviewImage').src=state.candidate.url;else $('reviewImage').removeAttribute('src');$('imageName').textContent=state.candidate.name;$('ocrText').value=state.candidate.text;state.ocrBusy=false;setOcrStatus('Nội dung bạn đã xác nhận. Có thể kiểm tra hoặc chỉnh sửa thêm.');$('imageDialog').showModal();});
  const toBase64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
  $('geminiOcr').addEventListener('click',async()=>{if(!isLive()||!state.candidate?.blob||state.ocrBusy)return;const blob=state.candidate.blob;const id=++state.imageSerial;state.ocrBusy=true;setOcrStatus('Đang gửi ảnh đến Vertex AI và đọc nội dung…','loading');const controller=new AbortController();ocrRequestController=controller;const t=setTimeout(()=>controller.abort(),65000);
    try{const data64=await toBase64(blob);if(id!==state.imageSerial||controller.signal.aborted)return;const image={data:data64,mimeType:'image/jpeg'};const res=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image}),signal:controller.signal});const data=await res.json();if(!res.ok)throw new Error();if(id!==state.imageSerial)return;const text=String(data.text||'');if(text.length>12000){state.ocrBusy=false;setOcrStatus('Gemini trả nội dung quá dài. Hãy chụp từng phần; nội dung cũ được giữ, không tự cắt kết quả.','error');return;}if(text.trim())recordAiResponse(data.model||state.api?.models?.basic||state.api?.model);$('ocrText').value=text;state.candidate.uncertain=data.uncertain===true;state.ocrBusy=false;setOcrStatus(data.uncertain?'Gemini báo có nội dung chưa rõ. Hãy đối chiếu lại với ảnh gốc.':'Gemini đã đọc xong. Vui lòng kiểm tra nội dung trước khi sử dụng.');}
    catch{if(id===state.imageSerial){invalidateReadiness('Chưa xác nhận kết nối AI','unavailable');state.ocrBusy=false;setOcrStatus('Chưa đọc được bằng Gemini. Kết quả trên máy vẫn được giữ để bạn kiểm tra.','error');}}finally{clearTimeout(t);if(ocrRequestController===controller)ocrRequestController=null;}
  });

  function stopCamera(){cameraSerial++;if(cameraStream)cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;$('cameraVideo').srcObject=null;$('takePhoto').disabled=true;}
  async function openCamera(){if(!navigator.mediaDevices?.getUserMedia){$('cameraFile').click();return;}stopCamera();const id=cameraSerial;$('cameraStatus').textContent='Đang mở camera…';$('cameraStatus').hidden=false;$('cameraDialog').showModal();
    try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(id!==cameraSerial||!$('cameraDialog').open){stream.getTracks().forEach(t=>t.stop());return;}cameraStream=stream;$('cameraVideo').srcObject=stream;await $('cameraVideo').play();if(id!==cameraSerial)return;$('cameraStatus').hidden=true;$('takePhoto').disabled=false;}
    catch{if(id!==cameraSerial||!$('cameraDialog').open)return;$('cameraStatus').textContent='Chưa mở được camera. Kiểm tra quyền camera của trình duyệt, hoặc chọn ảnh có sẵn.';}
  }
  $('openCamera').addEventListener('click',openCamera);$('closeCamera').addEventListener('click',()=>$('cameraDialog').close());$('cameraDialog').addEventListener('close',stopCamera);
  $('cameraLibrary').addEventListener('click',()=>{$('cameraDialog').close();$('imageFile').click();});
  $('takePhoto').addEventListener('click',async()=>{const video=$('cameraVideo');if(!video.videoWidth||!cameraStream)return;const id=cameraSerial;const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));if(id!==cameraSerial||!$('cameraDialog').open)return;$('cameraDialog').close();if(blob)readImage(new File([blob],'anh-chup.jpg',{type:'image/jpeg'}));});

  $('newChat').addEventListener('click',()=>{if(state.history.length||state.busy||state.attachment||question.value)$('resetDialog').showModal();else resetChat();});
  const compactNew=el('button','icon-button mobile-new-chat');compactNew.type='button';compactNew.setAttribute('aria-label','Cuộc trò chuyện mới');compactNew.title='Cuộc trò chuyện mới';compactNew.append(icon('plus'));document.querySelector('.topbar-actions').prepend(compactNew);compactNew.addEventListener('click',()=>$('newChat').click());
  $('mobileConfig').append(el('span','mobile-source-name',modeName(state.sourceMode)));question.setAttribute('enterkeyhint','enter');
  $('confirmReset').addEventListener('click',()=>{$('resetDialog').close();resetChat();});
  function resetChat(){state.serial++;requestController?.abort();requestController=null;stopOcr();releaseCandidate();if(state.attachment?.url)URL.revokeObjectURL(state.attachment.url);state.attachment=null;state.history=[];state.reply=null;state.busy=false;state.nearBottom=true;question.value='';$('messages').replaceChildren();$('welcome').hidden=false;$('chatError').hidden=true;$('threadCaption').textContent='Cuộc trò chuyện mới';$('newMessageBadge').hidden=true;renderAttachment();resizeInput();scroller.scrollTop=0;}
  let lastViewportHeight=0,lastViewportTop=0;
  const updateViewport=()=>{const height=window.visualViewport?.height||window.innerHeight,top=window.visualViewport?.offsetTop||0,changed=height!==lastViewportHeight||top!==lastViewportTop;lastViewportHeight=height;lastViewportTop=top;document.documentElement.style.setProperty('--viewport-height',`${height}px`);document.documentElement.style.setProperty('--viewport-top',`${top}px`);document.documentElement.classList.toggle('is-keyboard-open',Boolean(document.activeElement?.matches('textarea,input'))&&height<window.innerHeight-120);if(changed&&state.nearBottom&&chat.open)requestAnimationFrame(()=>scrollToLatest());};
  window.visualViewport?.addEventListener('resize',updateViewport);window.visualViewport?.addEventListener('scroll',updateViewport);window.addEventListener('resize',updateViewport);
  window.addEventListener('online',recheckWhenStale);
  window.addEventListener('offline',()=>{readinessController?.abort();readinessController=null;readinessPromise=null;invalidateReadiness('Thiết bị đang ngoại tuyến','offline');});
  document.addEventListener('visibilitychange',recheckWhenStale);
  window.addEventListener('pagehide',()=>{stopCamera();stopOcr();requestController?.abort();accessController?.abort();readinessController?.abort();readinessController=null;readinessPromise=null;invalidateReadiness();state.accessToken=null;state.accessExpiresAt=0;});
  updateViewport();checkStatus();openChat(document.querySelector('[data-open-chat]'));updateSend();
})();
