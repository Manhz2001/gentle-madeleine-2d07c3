(() => {
  'use strict';
  if (document.body.dataset.page === 'home' || /\/(?:nbcare|nb-care)(?:\/|$)/.test(location.pathname) || document.querySelector('[data-nbcare-quick-link]')) return;
  const scriptUrl = document.currentScript.src;
  if (!document.querySelector('link[data-nbcare-style]')) {
    const style = document.createElement('link');
    style.rel='stylesheet'; style.href=new URL('../nbcare/launcher.css?v=3',scriptUrl).href;
    style.dataset.nbcareStyle='true'; document.head.append(style);
  }
  const link = document.createElement('a');
  link.className = 'nbcare-fab';
  link.href = new URL('../nbcare/', scriptUrl).href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.nbcareQuickLink = 'true';
  link.dataset.analyticsLabel = 'Mở NBCare';
  link.setAttribute('aria-label', 'Mở NBCare trong tab mới');
  link.innerHTML = '<span class="nbcare-fab__icon" aria-hidden="true">✦</span><span><strong>NBCare</strong><small>Hỏi đáp thuốc & sức khỏe ↗</small></span>';
  document.body.append(link);
})();
