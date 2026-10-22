(function () {
  'use strict';
  const content = window.NBCareContent;
  const AI_ENDPOINT = 'https://gentle-madeleine-2d07c3.netlify.app/.netlify/functions/nb-care-ai';
  const $ = id => document.getElementById(id);
  const chat = $('nbChat'), transcript = $('nbTranscript'), input = $('nbInput');
  const welcome = $('nbWelcome'), sourcesPanel = $('nbSources');
  const main = chat.querySelector('.nb-main'), sidebar = chat.querySelector('.nb-sidebar');
  const siteNav = document.querySelector('.site-nav');
  const navToggle = document.querySelector('.site-nav__toggle');
  const mobile = window.matchMedia('(max-width: 600px)');
  let mode = 'basic', opened = false, expanded = false, greeted = true;
  let lastTrigger = null, sourceTrigger = null, timer = null, toastTimer = null, count = 0, requestSerial = 0;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name); svg.append(use); return svg;
  }
  function notify(text) {
    clearTimeout(toastTimer); $('nbToast').textContent = text; $('nbToast').hidden = false;
    toastTimer = setTimeout(() => { $('nbToast').hidden = true; }, 3300);
  }
  function isModal() { return opened && (expanded || mobile.matches || !sourcesPanel.hidden); }
  function syncLayout() {
    chat.classList.toggle('is-expanded', expanded);
    chat.setAttribute('aria-modal', String(isModal()));
    $('nbBackdrop').hidden = !isModal();
    document.body.classList.toggle('nb-modal-open', isModal());
    document.body.classList.toggle('nb-chat-open', opened);
    document.querySelectorAll('body > main, body > header, body > footer, body > .to-top, body > .skip-link').forEach(n => {
      n.inert = isModal();
    });
    const expandButton = $('nbExpand');
    expandButton.replaceChildren(icon(expanded ? 'collapse' : 'expand'));
    expandButton.setAttribute('aria-label', expanded ? 'Thu nhỏ khung chat' : 'Mở rộng khung chat');
    expandButton.title = expanded ? 'Thu nhỏ' : 'Mở rộng';
    $('nbLauncher').hidden = opened;
    $('nbGreeting').hidden = opened || !greeted;
    document.querySelectorAll('[data-nbcare-open], #nbLauncher').forEach(n => {
      n.setAttribute('aria-controls', 'nbChat'); n.setAttribute('aria-expanded', String(opened));
    });
  }
  function openChat(view = 'compact', trigger) {
    if (trigger || !opened) lastTrigger = trigger || document.activeElement;
    if (siteNav?.dataset.open === 'true') {
      siteNav.dataset.open = 'false';
      navToggle?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
    opened = true; expanded = view === 'expanded'; chat.hidden = false;
    chat.classList.add('is-opening'); syncLayout();
    requestAnimationFrame(() => { updateInput(); $('nbTitle').focus({preventScroll:true}); });
    setTimeout(() => chat.classList.remove('is-opening'), 250);
  }
  function closeChat() {
    if (!sourcesPanel.hidden) closeSources(false);
    opened = false; chat.hidden = true; syncLayout();
    if (lastTrigger && lastTrigger.isConnected && lastTrigger.getClientRects().length && !lastTrigger.closest('[hidden]')) lastTrigger.focus({preventScroll:true});
    else $('nbLauncher').focus({preventScroll:true});
  }
  function setMode(value, focus) {
    mode = value === 'deep' ? 'deep' : 'basic';
    document.querySelectorAll('[data-mode]').forEach(n => {
      n.setAttribute('aria-pressed', String(n.dataset.mode === mode));
      n.tabIndex = n.dataset.mode === mode ? 0 : -1;
    });
    $('modeHint').textContent = mode === 'deep' ? 'Chuyên sâu · Phân tích, căn cứ và giới hạn. Áp dụng cho câu trả lời tiếp theo.' : 'Cơ bản · Trả lời ngắn gọn, dễ hiểu. Áp dụng cho câu trả lời tiếp theo.';
    if (focus) document.querySelector('[data-mode="' + mode + '"]').focus();
  }
  function updateInput() {
    input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 104) + 'px';
    $('nbSend').disabled = !input.value.trim() || timer !== null;
    $('charCount').textContent = input.value.length + '/1200';
  }
  function scrollBottom() { requestAnimationFrame(() => { transcript.scrollTop = transcript.scrollHeight; }); }
  function sourceButton(source, index) {
    const button = el('button', 'citation'); button.type = 'button';
    button.append(el('b', '', String(index + 1)), icon('doc'), el('span', '', source.title));
    button.setAttribute('aria-label', 'Xem nguồn mẫu: ' + source.title);
    button.addEventListener('click', () => openSources(source.id, button)); return button;
  }
  function renderAnswer(answer, answerMode) {
    const article = el('article', 'message message-assistant');
    const avatar = el('span', 'message-avatar'); avatar.append(icon('cross')); avatar.setAttribute('aria-hidden', 'true');
    const body = el('div', 'message-body');
    const meta = el('div', 'answer-meta'); meta.append(el('strong', '', 'NB Care'), el('span', 'answer-mode', answerMode === 'deep' ? 'Chuyên sâu' : 'Cơ bản'), el('span', '', answer.provider === 'gemini' ? 'Gemini · nguồn chính thống' : 'Câu trả lời dự phòng'));
    body.append(meta);
    if (answer.needsSource || answer.tone === 'urgent-demo') {
      const status = el('div', 'source-status'); status.append(icon('info'), el('span', '', answer.needsSource ? 'Chưa kết nối nguồn chuyên môn' : 'Cần hỗ trợ trực tiếp')); body.append(status);
    }
    if (answer.title) body.append(el('h3', '', answer.title));
    body.append(el('p', '', answer.summary));
    answer.sections.forEach(section => {
      const block = el('section', 'answer-section');
      if (section.title) block.append(el('h4', '', section.title));
      if (section.text) block.append(el('p', '', section.text));
      if (section.bullets) { const list = el('ul'); section.bullets.forEach(text => list.append(el('li', '', text))); block.append(list); }
      body.append(block);
    });
    if (answer.medicalWarning) {
      const warning = el('div', 'medical-warning');
      warning.setAttribute('role', 'note');
      warning.append(icon('info'), el('p', '', answer.medicalWarning));
      body.append(warning);
    }
    if (answer.sourceIds.length) {
      const refs = el('div', 'answer-sources'); refs.append(el('span', '', 'NGUỒN MẪU · MINH HỌA GIAO DIỆN'));
      const list = el('div', 'citation-list');
      answer.sourceIds.forEach((id, i) => { const source = content.sources.find(s => s.id === id); if (source) list.append(sourceButton(source, i)); });
      refs.append(list); body.append(refs);
    }
    if (Array.isArray(answer.sources) && answer.sources.length) {
      const refs = el('div', 'answer-sources'); refs.append(el('span', '', 'NGUỒN THAM KHẢO ĐÃ TÌM THẤY'));
      const list = el('div', 'citation-list');
      answer.sources.forEach((source, i) => {
        const link = el('a', 'citation'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.append(el('b', '', String(i + 1)), icon('doc'), el('span', '', source.title || source.domain || 'Nguồn tham khảo'));
        list.append(link);
      });
      refs.append(list); body.append(refs);
    }
    const actions = el('div', 'answer-actions');
    const copy = el('button'); copy.type = 'button'; copy.append(icon('copy'), el('span', '', 'Sao chép')); copy.setAttribute('aria-label', 'Sao chép câu trả lời mẫu');
    copy.addEventListener('click', async () => {
      const text = ['NB Care · ' + (answer.provider === 'gemini' ? 'Gemini · nguồn đã duyệt' : 'Câu trả lời dự phòng') + ' · ' + (answerMode === 'deep' ? 'Chuyên sâu' : 'Cơ bản'), answer.title, answer.summary, ...answer.sections.map(s => [s.title, s.text, ...(s.bullets || [])].filter(Boolean).join('\n')), answer.medicalWarning, 'Thông tin không dùng để quyết định điều trị.'].filter(Boolean).join('\n\n');
      try { await navigator.clipboard.writeText(text); notify('Đã sao chép câu trả lời mẫu.'); }
      catch (_) { notify('Trình duyệt chưa cho phép sao chép. Bạn có thể chọn nội dung trực tiếp.'); }
    });
    const helpful = el('button'); helpful.type = 'button'; helpful.append(icon('thumb')); helpful.setAttribute('aria-label', 'Đánh dấu mẫu trả lời hữu ích'); helpful.setAttribute('aria-pressed', 'false');
    helpful.addEventListener('click', () => { const active = helpful.getAttribute('aria-pressed') !== 'true'; helpful.setAttribute('aria-pressed', String(active)); notify(active ? 'Đã đánh dấu trong bản xem trước.' : 'Đã bỏ đánh dấu.'); });
    actions.append(copy, helpful); body.append(actions);
    if (answer.followUps.length) {
      const follow = el('div', 'follow-ups'); follow.setAttribute('aria-label', 'Câu hỏi tiếp theo');
      answer.followUps.forEach(text => { const button = el('button', '', text); button.type = 'button'; button.addEventListener('click', () => send(text)); follow.append(button); });
      body.append(follow);
    }
    article.append(avatar, body); transcript.append(article); scrollBottom();
  }
  async function askAI(question, answerMode) {
    const response = await fetch(AI_ENDPOINT, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question, mode: answerMode})});
    if (!response.ok) throw new Error('AI unavailable');
    const payload = await response.json();
    if (!payload || payload.ok !== true || !payload.answer) throw new Error('Invalid AI response');
    return payload.answer;
  }
  function send(question) {
    question = String(question).trim().slice(0, 1200);
    if (!question || timer !== null) return;
    const answerMode = mode;
    welcome.hidden = true;
    const user = el('article', 'message message-user'); user.setAttribute('aria-label', 'Câu hỏi của bạn'); user.append(el('div', 'user-bubble', question)); transcript.append(user);
    if (!count++) $('conversationTitle').textContent = question.length > 35 ? question.slice(0, 35) + '…' : question;
    input.value = '';
    const typing = el('div', 'message message-assistant');
    const avatar = el('span', 'message-avatar'); avatar.append(icon('cross'));
    const label = el('span', 'typing'); const dots = el('span', 'typing-dots'); dots.setAttribute('aria-hidden', 'true'); dots.append(el('i'), el('i'), el('i')); label.append(dots, el('span', '', 'Đang soạn câu trả lời mẫu…')); typing.append(avatar, label); transcript.append(typing);
    transcript.setAttribute('aria-busy', 'true');
    const serial = ++requestSerial;
    timer = 1;
    Promise.all([askAI(question, answerMode), new Promise(resolve => setTimeout(resolve, 450))])
      .then(([answer]) => { if (serial === requestSerial) renderAnswer(answer, answerMode); })
      .catch(() => { if (serial === requestSerial) { renderAnswer(content.respond(question, answerMode), answerMode); notify('NB Care đang dùng câu trả lời dự phòng vì dịch vụ AI chưa sẵn sàng.'); } })
      .finally(() => { if (serial === requestSerial) { typing.remove(); timer = null; transcript.setAttribute('aria-busy', 'false'); updateInput(); } });
    updateInput(); scrollBottom();
  }
  function newConversation() {
    requestSerial += 1; if (timer !== null) clearTimeout(timer); timer = null; count = 0;
    transcript.querySelectorAll('.message').forEach(n => n.remove());
    transcript.setAttribute('aria-busy', 'false'); welcome.hidden = false;
    $('conversationTitle').textContent = 'Trò chuyện cùng NB Care'; input.value = ''; updateInput(); transcript.scrollTop = 0;
    notify('Đã bắt đầu cuộc trò chuyện mới.'); $('nbTitle').focus({preventScroll:true});
  }
  function renderSources(selected) {
    $('sourcesList').replaceChildren();
    content.sources.forEach(source => {
      const card = el('article', 'source-card' + (selected === source.id ? ' is-selected' : '')); card.id = 'source-' + source.id;
      const head = el('div', 'source-card-head'), mark = el('span', 'source-doc-icon'); mark.append(icon('doc'));
      const title = el('div'); title.append(el('h4', '', source.title), el('small', '', source.status)); head.append(mark, title);
      const details = el('details'); details.open = selected === source.id;
      details.append(el('summary', '', 'Xem đoạn trích mẫu'));
      const excerpt = el('div', 'source-excerpt'); excerpt.append(el('strong', '', source.section), document.createTextNode(source.excerpt)); details.append(excerpt);
      card.append(head, details); $('sourcesList').append(card);
    });
  }
  function openSources(id, trigger) {
    sourceTrigger = trigger || document.activeElement;
    renderSources(id); $('sourcesTitle').textContent = id ? 'Nguồn cho câu trả lời mẫu' : 'Kho nguồn mẫu';
    sourcesPanel.hidden = false; main.inert = true; sidebar.inert = true; syncLayout();
    requestAnimationFrame(() => { $('sourcesTitle').focus({preventScroll:true}); if (id) $('source-' + id)?.scrollIntoView({block:'nearest'}); });
  }
  function closeSources(restore = true) {
    sourcesPanel.hidden = true; main.inert = false; sidebar.inert = false; syncLayout();
    if (restore && sourceTrigger?.isConnected) sourceTrigger.focus({preventScroll:true});
  }
  document.querySelectorAll('[data-nbcare-open]').forEach(button => button.addEventListener('click', () => openChat(button.dataset.nbcareOpen, button)));
  $('nbLauncher').addEventListener('click', event => openChat('compact', event.currentTarget));
  $('nbClose').addEventListener('click', closeChat); $('nbBackdrop').addEventListener('click', closeChat);
  $('nbExpand').addEventListener('click', () => { expanded = !expanded; syncLayout(); updateInput(); $('nbExpand').focus(); });
  $('greetingDismiss').addEventListener('click', () => { greeted = false; $('nbGreeting').hidden = true; $('nbLauncher').focus(); });
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
    button.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setMode(event.key === 'Home' ? 'basic' : event.key === 'End' ? 'deep' : mode === 'basic' ? 'deep' : 'basic', true); }
    });
  });
  $('nbForm').addEventListener('submit', event => { event.preventDefault(); send(input.value); });
  input.addEventListener('input', updateInput);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(input.value); } });
  $('nbNew').addEventListener('click', newConversation); $('sidebarNew').addEventListener('click', newConversation);
  $('sampleAnswer')?.addEventListener('click', event => { openChat('expanded', event.currentTarget); if (!count) send(content.suggestions[0].question); });
  content.suggestions.forEach(item => {
    const button = el('button', 'prompt-button'); button.type = 'button'; button.append(el('span', '', item.label), icon('arrow')); button.addEventListener('click', () => send(item.question)); $('welcomePrompts').append(button);
  });
  document.querySelectorAll('[data-nbcare-sources]').forEach(button => button.addEventListener('click', () => { openChat('expanded', button); openSources(null, $('nbSourceButton')); }));
  document.querySelectorAll('[data-open-library], #nbSourceButton').forEach(button => button.addEventListener('click', () => openSources(null, button)));
  $('sourceBack').addEventListener('click', () => closeSources()); $('sourceClose').addEventListener('click', () => closeSources());
  document.querySelectorAll('[data-demo-link]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    if (button.closest('.site-nav__item--has-sub') && button.classList.contains('site-nav__link') && window.matchMedia('(max-width:900px)').matches) return;
    notify('Bạn đang xem demo NB Care. Các công cụ khác vẫn sử dụng trên website hiện tại.');
  }));
  document.addEventListener('keydown', event => {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); if (!sourcesPanel.hidden) closeSources(); else closeChat(); return; }
    if (event.key !== 'Tab' || (!isModal() && sourcesPanel.hidden)) return;
    const scope = sourcesPanel.hidden ? chat : sourcesPanel;
    const nodes = [...scope.querySelectorAll('button:not(:disabled),a[href],textarea:not(:disabled),summary,[tabindex="0"]')].filter(n => n.getClientRects().length && !n.closest('[inert]'));
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
    else if (!event.shiftKey && (index === nodes.length - 1 || index < 0)) { event.preventDefault(); nodes[0].focus(); }
  });
  mobile.addEventListener('change', syncLayout);
  function syncViewport() {
    const viewport = window.visualViewport;
    chat.style.setProperty('--nb-height', (viewport ? viewport.height : window.innerHeight) + 'px');
    chat.style.setProperty('--nb-top', (viewport ? viewport.offsetTop : 0) + 'px');
  }
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  window.addEventListener('resize', syncViewport);
  syncViewport();
  setMode('basic'); updateInput(); syncLayout();
  if (new URLSearchParams(location.search).get('embed') === '1') {
    document.body.classList.add('nb-embed');
    openChat('expanded');
  }
  window.NBCareDemo = Object.freeze({open: view => openChat(view), close: closeChat, setMode, newConversation});
})();
