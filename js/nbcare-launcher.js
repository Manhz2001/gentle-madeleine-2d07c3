(() => {
  'use strict';
  if (window.NBCareLauncher || /\/(?:nbcare|nb-care)(?:\/|$)/.test(location.pathname)) return;
  const scriptUrl = document.currentScript.src;
  const moduleUrl = new URL('../nbcare/', scriptUrl);
  if (!document.querySelector('link[data-nbcare-style]')) {
    const style = document.createElement('link');
    style.rel='stylesheet'; style.href=new URL('../nbcare/launcher.css?v=2',scriptUrl).href;
    style.dataset.nbcareStyle='true'; document.head.append(style);
  }
  const popupUrl = new URL(moduleUrl); popupUrl.search = '?view=chat&embed=1&source=popup';
  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'nbcare-fab'; fab.setAttribute('aria-label', 'Mở NBCare');
  fab.setAttribute('aria-expanded','false'); fab.setAttribute('aria-controls','NBCareDialog');
  fab.innerHTML = '<span class="nbcare-fab__icon">✦</span><span><strong>NBCare</strong><small>Hỏi đáp thuốc & sức khỏe</small></span>';
  const overlay = document.createElement('div'); overlay.className = 'nbcare-overlay'; overlay.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'nbcare-popover'; dialog.id = 'NBCareDialog';
  dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-label','NBCare'); dialog.tabIndex=-1;
  const frame = document.createElement('iframe'); frame.title = 'NBCare — BVĐK tỉnh Ninh Bình';
  frame.allow = 'clipboard-write; fullscreen'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
  dialog.append(frame); overlay.append(dialog); document.body.append(overlay,fab);
  let trigger = null, savedOverflow = '', inertNodes = [];
  const close = () => {
    if (overlay.hidden) return;
    overlay.hidden=true; fab.hidden=false; fab.setAttribute('aria-expanded','false');
    document.body.style.overflow=savedOverflow; document.body.classList.remove('nbcare-modal-open');
    frame.contentWindow?.postMessage({type:'nbcare:closed'},moduleUrl.origin);
    inertNodes.forEach(([node,value])=>{node.inert=value;}); inertNodes=[];
    if (trigger?.isConnected) trigger.focus({preventScroll:true});
  };
  const open = button => {
    if (!overlay.hidden) return;
    trigger=button || document.activeElement; savedOverflow=document.body.style.overflow;
    overlay.hidden=false; fab.hidden=true; fab.setAttribute('aria-expanded','true');
    document.body.style.overflow='hidden'; document.body.classList.add('nbcare-modal-open');
    inertNodes=Array.from(document.body.children).filter(node=>node!==overlay&&node!==fab&&node.tagName!=='SCRIPT').map(node=>[node,node.inert]);
    inertNodes.forEach(([node])=>{node.inert=true;});
    if (!frame.getAttribute('src')) frame.src=popupUrl.href;
    else frame.contentWindow?.postMessage({type:'nbcare:opened'},moduleUrl.origin);
    dialog.focus({preventScroll:true});
  };
  fab.addEventListener('click',()=>open(fab));
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-nbcare-open]');
    if (target) {event.preventDefault();open(target);}
  });
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  document.addEventListener('keydown',event=>{
    if(overlay.hidden)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab' && document.activeElement===dialog){event.preventDefault();frame.focus();}
  });
  window.addEventListener('message',event=>{
    if(event.origin===moduleUrl.origin&&event.source===frame.contentWindow&&event.data?.type==='nbcare:close')close();
  });
  window.NBCareLauncher=Object.freeze({open,close});
})();
