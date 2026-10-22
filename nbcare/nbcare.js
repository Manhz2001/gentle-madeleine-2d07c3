(() => {
  'use strict';
  const CHAT_URL = 'https://script.google.com/macros/s/AKfycbznJ-X-G3AIi2IfPcI4v0RAINSDQQbYpd5iQz0wH-ooSzwu_bmYlCBEECEqTFS1xJw/exec?view=full&embed=1&voice=0';
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embed') === '1';
  const workspace = document.getElementById('NBCareChat');
  const frame = document.getElementById('NBCareFrame');
  const opener = document.getElementById('NBCareOpen');
  const status = document.getElementById('frameStatus');
  const inPopup = params.get('source') === 'popup';
  const entryPoint = inPopup ? 'popup' : 'module';
  let loaded = false;
  document.body.dataset.embedded = String(embedded);
  document.getElementById('NBCareFallback').href = CHAT_URL;
  const track = name => window.NBCareAnalytics?.track(name, {entry_point: entryPoint});
  const syncHeight = () => {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--chat-height', `${Math.round(viewport?.height || innerHeight)}px`);
    document.documentElement.style.setProperty('--chat-top', `${Math.round(viewport?.offsetTop || 0)}px`);
  };
  const open = () => {
    workspace.hidden = false;
    document.body.classList.add('chat-open');
    document.getElementById('moduleLanding').inert = true;
    document.getElementById('moduleHeader').inert = true;
    document.getElementById('moduleFooter').inert = true;
    if (!frame.getAttribute('src')) frame.src = CHAT_URL;
    status.hidden = loaded;
    syncHeight();
    track('nbcare_open');
    document.getElementById('NBCareClose').focus({preventScroll:true});
  };
  const close = () => {
    if (inPopup && window.parent !== window) {
      window.parent.postMessage({type:'nbcare:close'}, location.origin);
      return;
    }
    track('nbcare_close');
    workspace.hidden = true;
    document.body.classList.remove('chat-open');
    ['moduleLanding','moduleHeader','moduleFooter'].forEach(id => { document.getElementById(id).inert = false; });
    opener.focus({preventScroll:true});
  };
  frame.addEventListener('load', () => { if (!frame.getAttribute('src')) return; loaded = true; status.hidden = true; });
  opener.addEventListener('click', open);
  document.getElementById('NBCareClose').addEventListener('click', close);
  window.addEventListener('message',event=>{
    if(!inPopup || event.origin!==location.origin || event.source!==window.parent)return;
    if(event.data?.type==='nbcare:opened') {track('nbcare_open');syncHeight();}
    if(event.data?.type==='nbcare:closed')track('nbcare_close');
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !workspace.hidden) close(); });
  window.addEventListener('resize', syncHeight, {passive:true});
  window.visualViewport?.addEventListener('resize', syncHeight, {passive:true});
  window.visualViewport?.addEventListener('scroll', syncHeight, {passive:true});
  if (embedded || params.get('view') === 'chat') open();
})();
