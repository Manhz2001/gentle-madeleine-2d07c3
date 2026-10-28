(() => {
  'use strict';
  const moduleBase = new URL('.', document.currentScript.src);
  const embedded = new URLSearchParams(location.search).get('embed') === '1' || window.self !== window.top;
  if (embedded) document.documentElement.classList.add('is-embedded');
  const $ = id => document.getElementById(id);
  const state = {sourceMode:'closed',answerStyle:'basic',busy:false,serial:0,history:[],reply:null,attachment:null,candidate:null,imageSerial:0,ocrBusy:false,nearBottom:true,api:null};
  const chat = $('chatDialog'), scroller = $('messageScroll'), question = $('question');
  let requestController, ocrRequestController, cameraStream, cameraSerial=0, workerPromise, workerInstance, toastTimer, lastTrigger;
  const icon = name => { const s=document.createElementNS('http://www.w3.org/2000/svg','svg'); const u=document.createElementNS(s.namespaceURI,'use');u.setAttribute('href',`#i-${name}`);s.append(u);s.setAttribute('aria-hidden','true');return s; };
  const el = (tag,cls,text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  const modeName = mode => mode==='open'?'Nguồn mở':'Nguồn đóng';
  const modeIcon = mode => mode==='open'?'globe':'lock';
  const isLive = () => Boolean(state.api?.configured && state.api?.provider!=='local-demo' && state.api?.demo!==true);
  const toast = text => {clearTimeout(toastTimer);$('toast').textContent=text;chat.append($('toast'));$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);};

  function openChat(trigger) {lastTrigger=trigger||document.activeElement;if(!chat.open)chat.showModal();requestAnimationFrame(()=>{if(window.innerWidth>760)question.focus({preventScroll:true});});}
  document.querySelectorAll('[data-open-chat]').forEach(b=>b.addEventListener('click',()=>openChat(b)));
  $('closeChat').addEventListener('click',()=>chat.close());
  chat.addEventListener('cancel',event=>{if(embedded)event.preventDefault();});
  chat.addEventListener('close',()=>{lastTrigger?.focus?.({preventScroll:true});});
  $('expandChat').addEventListener('click',()=>{const on=chat.classList.toggle('is-full');$('expandChat').setAttribute('aria-pressed',String(on));$('expandChat').setAttribute('aria-label',on?'Thu gọn khung chat':'Mở rộng khung chat');});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  $('mobileConfig').addEventListener('click',()=>$('configDialog').showModal());
  document.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',()=>setSourceMode(b.dataset.source)));
  document.querySelectorAll('[data-style]').forEach(b=>b.addEventListener('click',()=>{state.answerStyle=b.dataset.style;document.querySelectorAll('[data-style]').forEach(n=>{const active=n.dataset.style===state.answerStyle;n.classList.toggle('is-active',active);n.setAttribute('aria-pressed',String(active));});}));

  function setSourceMode(mode) {
    state.sourceMode=mode==='open'?'open':'closed';
    document.querySelectorAll('[data-source]').forEach(n=>{const active=n.dataset.source===state.sourceMode;n.classList.toggle('is-active',active);n.setAttribute('aria-pressed',String(active));});
    $('modeCaption').textContent=modeName(state.sourceMode);
    $('composerMode').replaceChildren(icon(modeIcon(mode)),document.createTextNode(modeName(mode)));
    $('sourceDescription').textContent=mode==='open'?'Ưu tiên DrugView, sau đó tài liệu y khoa chính thống tại Việt Nam và quốc tế.':'Tra cứu kho DrugView được cấu hình. Khi dữ liệu chưa đủ căn cứ, trợ lý sẽ nói rõ giới hạn.';
    if(!state.reply)renderEvidence();
    if($('configDialog').open)$('configDialog').close();
  }

  function safeSources(sources) {
    if(!Array.isArray(sources))return [];
    const seen=new Set();return sources.slice(0,10).flatMap((s,i)=>{try{const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password||seen.has(u.href))return [];seen.add(u.href);return [{id:String(s.id||`S${i+1}`).slice(0,40),title:String(s.title||u.hostname).slice(0,300),url:u.href,origin:['internal','closed'].includes(s.origin)?'internal':'external',provenance:s.provenance==='published_drugview'?'published_drugview':s.provenance==='approved_local'?'approved_local':null}];}catch{return [];}});
  }
  function evidenceNodes(reply=state.reply) {
    const fragment=document.createDocumentFragment();
    if(reply){
      fragment.append(el('p','evidence-result-mode',`${modeName(reply.sourceMode)} · Căn cứ của câu trả lời đã chọn`));
      if(reply.provider==='local-demo'||reply.status==='demo')fragment.append(el('strong','evidence-result-title','Minh họa luồng · Chưa có câu trả lời AI'));
      else fragment.append(el('strong','evidence-result-title',reply.grounded&&reply.sources.length?'Có tài liệu kèm theo':'Chưa đủ căn cứ được kiểm chứng'));
      if(reply.sources.length){for(const s of reply.sources){const a=el('a','evidence-source');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';const originLabel=s.provenance==='published_drugview'?'Danh mục DrugView đã xuất bản':s.origin==='internal'?'Kho tài liệu được duyệt':'Nguồn bên ngoài';a.append(el('strong','',s.title),el('span','',`${originLabel} · ${new URL(s.url).hostname} ↗`));fragment.append(a);}return fragment;}
    }
    const empty=el('div','evidence-state');empty.append(icon(reply?'book':modeIcon(state.sourceMode)));
    const drugview=state.api?.closedSource;
    empty.append(el('strong','',reply?'Chưa có tài liệu trích dẫn':state.sourceMode==='closed'?(drugview?.lastFetchFailed?'Chưa lấy được dữ liệu mới':drugview?.loaded?'Đã nạp danh mục DrugView':drugview?.configured?'Nguồn DrugView đã cấu hình':'Kho tài liệu chưa được nạp'):'Tra cứu thêm nguồn chính thống'));
    empty.append(el('p','',reply?'Chỉ các tài liệu thực sự do máy chủ trả về mới xuất hiện ở đây.':state.sourceMode==='closed'?(drugview?.configured?'Tra cứu dữ liệu đã xuất bản trên DrugView, kèm liên kết tài liệu gốc. Không tự bổ sung thông tin còn trống.':'Kho nguồn chưa sẵn sàng để trả lời câu hỏi có căn cứ. Vui lòng thử lại sau.'):'Căn cứ tìm được qua Gemini sẽ được hiển thị và phân biệt với kho nội bộ.'));
    fragment.append(empty,el('p','evidence-label','THỨ TỰ ƯU TIÊN NGUỒN'));
    const list=el('ol','priority-list');
    [['DrugView Ninh Bình','Dữ liệu đã xuất bản & kho được duyệt'],['Bộ Y tế & Cục Quản lý Dược','Tài liệu chính thức tại Việt Nam'],['WHO & cơ quan y tế','Hướng dẫn y khoa chính thống']].forEach(([t,d],i)=>{const li=el('li');const body=el('div');body.append(el('strong','',t),el('small','',d));li.append(el('span','priority-number',String(i+1)),body);list.append(li);});
    fragment.append(list,el('p','evidence-note','Đây là chính sách lựa chọn nguồn, không phải danh sách tài liệu đã dùng trong câu trả lời. Ảnh và văn bản bạn gửi không được xem là hướng dẫn chuyên môn đã duyệt.'));
    return fragment;
  }
  function renderEvidence(){ $('evidenceContent').replaceChildren(evidenceNodes()); }
  function showSources(reply=state.reply){if(reply)state.reply=reply;renderEvidence();$('sourceDialogContent').replaceChildren(evidenceNodes(reply));$('sourcesDialog').showModal();}
  $('openLibrary').addEventListener('click',()=>showSources());$('mobileSources').addEventListener('click',()=>showSources());

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
  function attachSuggestionsHtml(body,html){
    if(typeof html!=='string'||!html.trim()||html.length>100000)return;
    const frame=el('iframe','search-suggestions');frame.title='Google Search Suggestions';frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.referrerPolicy='no-referrer';
    const csp="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; form-action 'none';";
    frame.srcdoc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"></head><body>${html}</body></html>`;body.append(frame);
  }
  function finishMessage(m,reply) {
    m.content.textContent=reply.text;
    if(reply.provider==='local-demo'||reply.status==='demo')m.meta.append(el('span','demo-message-tag','Demo · AI chưa kết nối'));
    else if(!reply.grounded)m.meta.append(el('span','demo-message-tag','Chưa đủ căn cứ'));
    const actions=el('div','message-actions'),copy=el('button');copy.type='button';copy.append(icon('copy'),document.createTextNode('Sao chép'));
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(reply.text);toast('Đã sao chép câu trả lời.');}catch{toast('Trình duyệt chưa cho phép sao chép. Bạn có thể chọn văn bản để sao chép.');}});
    const sourceButton=el('button');sourceButton.type='button';sourceButton.append(icon('book'),document.createTextNode(reply.sources.length?`${reply.sources.length} nguồn`:'Xem căn cứ'));sourceButton.addEventListener('click',()=>showSources(reply));actions.append(copy,sourceButton);m.body.append(actions);
    if(reply.sources.length){const chips=el('div','answer-sources');reply.sources.slice(0,3).forEach((s,i)=>{const b=el('button','source-chip',`${i+1}. ${s.title}`);b.type='button';b.addEventListener('click',()=>showSources(reply));chips.append(b);});m.body.append(chips);}
    attachSuggestionsHtml(m.body,reply.searchSuggestionsHtml);state.reply=reply;renderEvidence();scrollToLatest();
  }
  const resizeInput=()=>{question.style.height='auto';question.style.height=Math.min(question.scrollHeight,110)+'px';updateSend();};
  function updateSend(){$('sendMessage').disabled=state.busy||(!question.value.trim()&&!state.attachment);$('sendMessage').setAttribute('aria-label',state.busy?'Đang xử lý câu hỏi':'Gửi câu hỏi');}
  question.addEventListener('input',resizeInput);question.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('sendMessage').disabled)$('chatForm').requestSubmit();}});
  document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{question.value=b.dataset.prompt;resizeInput();question.focus();}));

  $('chatForm').addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy)return;
    const raw=question.value.trim(),attachment=state.attachment;if(!raw&&!attachment)return;
    const message=raw||'Giúp tôi tìm thông tin từ nội dung ảnh đã kiểm tra.',mode=state.sourceMode,style=state.answerStyle;
    const id=++state.serial;state.busy=true;updateSend();$('chatError').hidden=true;
    const user=messageNode('user',message,mode,style,Boolean(attachment));const pending=pendingNode(mode,style);question.value='';resizeInput();$('threadCaption').textContent='Hội thoại hiện tại';
    const history=state.history.filter(h=>h.sourceMode===mode).slice(-6).map(({role,text})=>({role,text:text.slice(0,4000)}));
    const controller=new AbortController();requestController=controller;const timeout=setTimeout(()=>controller.abort(),85000);
    try{
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,sourceMode:mode,answerStyle:style,history,ocrText:attachment?.text||''}),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error('request');if(id!==state.serial)return;
      if(typeof data.text!=='string'||!data.text.trim())throw new Error('empty');
      const reply={...data,text:data.text,sourceMode:mode,sources:safeSources(data.sources),grounded:data.grounded===true};finishMessage(pending,reply);
      state.history.push({role:'user',text:message,sourceMode:mode},{role:'assistant',text:reply.text,sourceMode:mode});state.history=state.history.slice(-16);
      if(data.provider==='vertex-adk'&&reply.grounded){$('connectionLabel').textContent='Vertex Agent · Đã nhận phản hồi';$('connectionDot').classList.add('is-live');}
    }catch(error){if(id!==state.serial)return;pending.root.remove();user.meta.append(el('span','demo-message-tag','Gửi chưa thành công'));if(!question.value)question.value=raw;$('chatError').textContent=controller.signal.aborted?'Yêu cầu đã hết thời gian chờ. Bản nháp được giữ để bạn gửi lại.':'Chưa nhận được phản hồi từ máy chủ. Vui lòng thử lại sau.';$('chatError').hidden=false;}
    finally{clearTimeout(timeout);if(id===state.serial){state.busy=false;requestController=null;resizeInput();}}
  });

  async function checkStatus(){
    try{const response=await fetch('/api/status',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error();const data=await response.json();state.api=data;if(isLive()){$('connectionLabel').textContent='Vertex đã cấu hình · Chờ kiểm tra kết nối';document.querySelector('.demo-disclosure p').textContent='Mỗi câu trả lời có phần căn cứ riêng. Hãy đối chiếu tài liệu và thông tin chuyên môn trước khi áp dụng.';$('geminiOcr').replaceChildren(document.createTextNode('Đọc lại bằng Gemini'));$('ocrPrivacy').textContent='Bấm “Đọc lại bằng Gemini” sẽ gửi ảnh này đến Vertex AI. Hãy ẩn thông tin cá nhân không cần thiết.';imageControls();renderEvidence();}else $('connectionLabel').textContent='Chưa kết nối AI · Vui lòng thử lại sau';}
    catch{$('connectionLabel').textContent='Máy chủ chưa sẵn sàng · Bạn vẫn có thể đọc chữ trên máy';}
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
  async function readImage(file, trustedSample=false){
    if(!file)return;if(state.ocrBusy)stopOcr();releaseCandidate();const id=++state.imageSerial;
    if(!trustedSample&&!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Chọn ảnh JPG, PNG hoặc WebP. Với ảnh HEIC, hãy chuyển sang JPG trước.');return;}
    state.candidate={blob:null,url:null,name:file.name||'Ảnh chụp',text:'',uncertain:true};$('ocrText').value='';$('reviewImage').removeAttribute('src');$('imageName').textContent=file.name||'Ảnh chụp';state.ocrBusy=true;setOcrStatus('Đang chuẩn bị ảnh…','loading');if(!$('imageDialog').open)$('imageDialog').showModal();
    try{const blob=await normalizeImage(file);if(id!==state.imageSerial)return;const url=URL.createObjectURL(blob);state.candidate={blob,url,name:file.name||'Ảnh chụp',text:'',uncertain:false};$('reviewImage').src=url;
      setOcrStatus('Đang chuẩn bị bộ đọc chữ trên máy…','loading');const worker=await getWorker();if(id!==state.imageSerial)return;
      setOcrStatus('Đang đọc nội dung ảnh…','loading');const result=await worker.recognize(blob);if(id!==state.imageSerial)return;
      const text=String(result.data?.text||'').trim();if(text.length>12000){state.ocrBusy=false;setOcrStatus('Ảnh có quá nhiều nội dung cho một lượt. Hãy chụp từng phần; hệ thống không tự cắt bỏ nội dung.','error');return;}state.candidate.text=text;state.candidate.uncertain=Number(result.data?.confidence||0)<75;state.ocrBusy=false;$('ocrText').value=text;
      setOcrStatus(text?(state.candidate.uncertain?'Có nội dung chưa rõ. Hãy đối chiếu và sửa lại với ảnh gốc.':'Đã đọc xong. Hãy kiểm tra nội dung trước khi sử dụng.'):'Chưa đọc được chữ rõ ràng. Bạn có thể nhập lại hoặc chọn ảnh khác.',text?'':'error');
    }catch{if(id!==state.imageSerial)return;state.ocrBusy=false;setOcrStatus('Không đọc được ảnh. Thử ảnh rõ hơn hoặc nhập lại nội dung nhìn thấy.','error');}
  }
  $('uploadImage').addEventListener('click',()=>$('imageFile').click());$('suggestImage').addEventListener('click',()=>$('imageFile').click());
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
    try{const data64=await toBase64(blob);if(id!==state.imageSerial||controller.signal.aborted)return;const image={data:data64,mimeType:'image/jpeg'};const res=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image}),signal:controller.signal});const data=await res.json();if(!res.ok)throw new Error();if(id!==state.imageSerial)return;const text=String(data.text||'');if(text.length>12000){state.ocrBusy=false;setOcrStatus('Gemini trả nội dung quá dài. Hãy chụp từng phần; nội dung cũ được giữ, không tự cắt kết quả.','error');return;}$('ocrText').value=text;state.candidate.uncertain=data.uncertain===true;state.ocrBusy=false;setOcrStatus(data.uncertain?'Gemini báo có nội dung chưa rõ. Hãy đối chiếu lại với ảnh gốc.':'Gemini đã đọc xong. Vui lòng kiểm tra nội dung trước khi sử dụng.');}
    catch{if(id===state.imageSerial){state.ocrBusy=false;setOcrStatus('Chưa đọc được bằng Gemini. Kết quả trên máy vẫn được giữ để bạn kiểm tra.','error');}}finally{clearTimeout(t);if(ocrRequestController===controller)ocrRequestController=null;}
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
  const compactNew=el('button','icon-button mobile-config');compactNew.type='button';compactNew.setAttribute('aria-label','Cuộc trò chuyện mới');compactNew.append(icon('plus'));$('mobileConfig').before(compactNew);compactNew.addEventListener('click',()=>$('newChat').click());
  const sampleButton=el('button','text-button sample-button','Thử đọc ảnh mẫu OCR');sampleButton.type='button';$('welcome').insertBefore(sampleButton,document.querySelector('.demo-disclosure'));sampleButton.addEventListener('click',async()=>{try{const r=await fetch(new URL('assets/ocr-sample.svg',moduleBase));if(!r.ok)throw new Error();readImage(new File([await r.blob()],'anh-mau-ocr.svg',{type:'image/svg+xml'}),true);}catch{toast('Chưa tải được ảnh mẫu. Bạn có thể chọn ảnh JPG hoặc PNG từ máy.');}});
  $('confirmReset').addEventListener('click',()=>{$('resetDialog').close();resetChat();});
  function resetChat(){state.serial++;requestController?.abort();requestController=null;stopOcr();releaseCandidate();if(state.attachment?.url)URL.revokeObjectURL(state.attachment.url);state.attachment=null;state.history=[];state.reply=null;state.busy=false;state.nearBottom=true;question.value='';$('messages').replaceChildren();$('welcome').hidden=false;$('chatError').hidden=true;$('threadCaption').textContent='Cuộc trò chuyện mới';$('newMessageBadge').hidden=true;renderAttachment();renderEvidence();resizeInput();scroller.scrollTop=0;}
  const updateViewport=()=>{document.documentElement.style.setProperty('--viewport-height',`${window.visualViewport?.height||window.innerHeight}px`);document.documentElement.style.setProperty('--viewport-top',`${window.visualViewport?.offsetTop||0}px`);};
  window.visualViewport?.addEventListener('resize',updateViewport);window.visualViewport?.addEventListener('scroll',updateViewport);window.addEventListener('resize',updateViewport);
  window.addEventListener('pagehide',()=>{stopCamera();stopOcr();requestController?.abort();});
  updateViewport();renderEvidence();checkStatus();openChat(document.querySelector('[data-open-chat]'));updateSend();
})();
