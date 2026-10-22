(() => {
  if (document.querySelector('.nbcare-fab')) return;
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'nbcare-fab';
  launcher.setAttribute('aria-label', 'Mở NB Care');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = '<span class="nbcare-fab__icon">✦</span><span><strong>NB Care</strong><small>Trợ lý tư vấn y tế</small></span>';
  const panel = document.createElement('section');
  panel.className = 'nbcare-popover';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'NB Care');
  panel.innerHTML = '<div class="nbcare-popover__head"><div><strong>NB Care</strong><span>Trợ lý tư vấn y tế</span></div><a href="nb-care/index.html" aria-label="Mở NB Care toàn màn hình">Mở rộng</a><button type="button" aria-label="Đóng NB Care">×</button></div><iframe title="NB Care" loading="lazy" data-src="nb-care/index.html?embed=1"></iframe>';
  const setOpen = (open) => {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      const frame = panel.querySelector('iframe');
      if (!frame.src) frame.src = frame.dataset.src;
    }
  };
  launcher.addEventListener('click', () => setOpen(panel.hidden));
  panel.querySelector('button').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  document.body.append(panel, launcher);
})();
