/**
 * DrugView Ninh Bình — site JS
 * Sticky header shadow · mobile nav drawer · submenu toggle · accordion · back-to-top.
 */
(() => {
  'use strict';

  // ---- 1. Sticky header shadow on scroll ----
  const header = document.querySelector('.site-header');
  if (header) {
    const update = () => {
      header.dataset.scrolled = String(window.scrollY > 4);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  // ---- 2. Mobile nav + submenu ----
  const nav = document.querySelector('.site-nav');
  if (nav) {
    const toggle = nav.querySelector('.site-nav__toggle');
    const openNav = (open) => {
      nav.dataset.open = String(open);
      toggle?.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle?.addEventListener('click', () => openNav(nav.dataset.open !== 'true'));

    // submenu triggers — desktop shows on hover (CSS); on mobile/touch we toggle click
    nav.querySelectorAll('.site-nav__item--has-sub').forEach(item => {
      const link = item.querySelector('.site-nav__link');
      if (!link) return;
      link.addEventListener('click', (e) => {
        // Only intercept on narrow viewports (mobile drawer)
        if (window.matchMedia('(max-width: 900px)').matches) {
          e.preventDefault();
          const open = item.dataset.open === 'true';
          nav.querySelectorAll('.site-nav__item--has-sub').forEach(x => {
            if (x !== item) x.dataset.open = 'false';
          });
          item.dataset.open = String(!open);
          link.setAttribute('aria-expanded', String(!open));
        }
      });

      // desktop keyboard: ArrowDown opens submenu and focuses first item
      link.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          item.dataset.open = 'true';
          const first = item.querySelector('.site-nav__submenu a');
          first?.focus();
        }
      });
    });

    // Click outside drawer closes it (mobile)
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target) && nav.dataset.open === 'true') openNav(false);
    });

    // Esc closes drawer + submenus
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (nav.dataset.open === 'true') openNav(false);
      nav.querySelectorAll('.site-nav__item--has-sub[data-open="true"]').forEach(x => {
        x.dataset.open = 'false';
        x.querySelector('.site-nav__link')?.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---- 3. Accordion (multiple panels can open) ----
  document.querySelectorAll('.accordion__trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.accordion__item');
      if (!item) return;
      const open = item.dataset.open === 'true';
      item.dataset.open = String(!open);
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  // ---- 3b. Document browser for protocol and professional update pages ----
  const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const extractDate = (text) => {
    const match = String(text || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return { label: 'Chưa rõ', value: 0 };
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    return {
      label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
      value: new Date(year, month - 1, day).getTime()
    };
  };

  const extractDecision = (text) => {
    const value = String(text || '');
    const patterns = [
      /(?:số|so)\s*([0-9]{1,5}\/[0-9A-ZĐa-zđ/\-.]+)/i,
      /\(([0-9]{1,5}\/(?:QĐ|QD|TT|NĐ|ND|QH|VBHN|BYT|BTC)[^) ]*)/i,
      /([0-9]{1,5}\/(?:QĐ|QD|TT|NĐ|ND|QH|VBHN|BYT|BTC)[0-9A-ZĐa-zđ/\-.]*)/i
    ];
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match?.[1]) return match[1].replace(/[,.]$/, '');
    }
    return 'Chưa rõ';
  };

  const sourceFromCategory = (category, pageType) => {
    const key = normalizeText(category);
    if (pageType === 'capnhat') {
      if (key.includes('tap huan')) return 'Khoa Dược';
      return 'Văn bản pháp quy';
    }
    if (key.includes('bo y te')) return 'Bộ Y tế';
    if (key.includes('tim mach')) return 'Hội Tim mạch học Việt Nam';
    if (key.includes('ho hap')) return 'Hội Hô hấp Việt Nam';
    if (key.includes('tiet nieu') || key.includes('vuna')) return 'Hội Tiết niệu - Thận học Việt Nam';
    return 'Nguồn chuyên môn';
  };

  const shortCategory = (category) => {
    const text = String(category || '').replace(/^Phác đồ điều trị của\s*/i, '').replace(/^Tập huấn chuyên môn\s*[—-]\s*/i, '');
    const key = normalizeText(text);
    if (key.includes('bo y te')) return 'Bộ Y tế';
    if (key.includes('thong tin thuoc')) return 'Tập huấn';
    if (key.includes('luat') || key.includes('thong tu')) return 'Văn bản dược';
    if (key.includes('tim mach')) return 'Tim mạch';
    if (key.includes('ho hap')) return 'Hô hấp';
    if (key.includes('tiet nieu') || key.includes('vuna')) return 'Thận - Tiết niệu';
    return text.length > 28 ? `${text.slice(0, 26)}...` : text;
  };

  const createOption = (value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  };

  const getDocumentPageConfig = () => {
    const page = document.body.dataset.page;
    if (page === 'phacdo') {
      return {
        type: 'phacdo',
        title: 'Hướng dẫn và phác đồ điều trị',
        searchPlaceholder: 'Tìm: tim, thận, COPD, tăng huyết áp...',
        categoryLabel: 'Chuyên khoa',
        decisionPlaceholder: 'Ví dụ: 1857/QĐ-BYT'
      };
    }
    if (page === 'capnhat') {
      return {
        type: 'capnhat',
        title: 'Cập nhật chuyên môn dược',
        searchPlaceholder: 'Tìm: luật dược, kê đơn, kháng sinh, ADR...',
        categoryLabel: 'Nhóm tài liệu',
        decisionPlaceholder: 'Ví dụ: 26/2025/TT-BYT'
      };
    }
    return null;
  };

  const appendixLinksByDocumentHref = new Map([
    ['https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/8/80-btc.pdf', [
      {
        title: 'Phụ lục kèm theo Thông tư số 80/2025/TT-BTC',
        href: 'https://drive.google.com/drive/folders/1YUTLFBEYTd0l4WshRKwmSnCSmC_ZIsu6?usp=drive_link'
      }
    ]],
    ['https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/8/79-btc.pdf', [
      {
        title: 'Phụ lục kèm theo Thông tư số 79/2025/TT-BTC',
        href: 'https://drive.google.com/drive/folders/18J4HfBEAXpFOH5M-tQTGZn1rcEzQ9p2l?usp=drive_link'
      }
    ]],
    ['https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/4/03-byt.pdf', [
      {
        title: 'Phụ lục kèm theo Thông tư số 03/2024/TT-BYT',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/4/03-byt-kem.pdf'
      }
    ]],
    ['https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/29-byt.pdf', [
      {
        title: 'Phụ lục kèm theo Thông tư số 29/2025/TT-BYT',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/29-byt-kem.pdf'
      }
    ]],
    ['https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/11/37-byt.pdf', [
      {
        title: 'Phụ lục kèm theo Thông tư số 37/2024/TT-BYT',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/11/37-byt-kem.pdf'
      }
    ]],
    ['https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/28-byt.pdf', [
      {
        title: 'Phụ lục I - Nguyên tắc, tiêu chuẩn GMP-WHO',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/1-phuluci-whogmp-final.signed.pdf'
      },
      {
        title: 'Phụ lục II - Mẫu hồ sơ, biểu mẫu GMP-WHO',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/2-phulucii-whogmpmau.signed.pdf'
      },
      {
        title: 'Phụ lục III - Nguyên tắc, tiêu chuẩn PIC/S-GMP',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/3-phuluciii-picsgmp.signed.pdf'
      },
      {
        title: 'Phụ lục IV - Nguyên tắc, tiêu chuẩn EU-GMP',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/4-phuluciv-eugmp.signed.pdf'
      },
      {
        title: 'Phụ lục V - Thuốc dược liệu',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/5-phulucv-thuocduoclieu-final.signed.pdf'
      },
      {
        title: 'Phụ lục VI - Thuốc cổ truyền',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/6-phulucvi-thuoccotruyen-final.signed.pdf'
      },
      {
        title: 'Phụ lục VII - Vị thuốc cổ truyền',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/7-phulucvii-vithuoccotruyen-final.signed.pdf'
      },
      {
        title: 'Phụ lục VIII - Hồ sơ tổng thể',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/8-phulucviii-hosotongthe.signed.pdf'
      },
      {
        title: 'Phụ lục IX - Phân loại tồn tại',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/9-phulucix-phanloaitontai-final.signed.pdf'
      },
      {
        title: 'Phụ lục X - Biểu mẫu',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/10-phulucx-bieumau-final.signed.pdf'
      },
      {
        title: 'Phụ lục XI - Cách ghi dạng bào chế',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/11-phulucxi-cachghidangbaoche.signed.pdf'
      }
    ]],
    ['https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/32-byt.pdf', [
      {
        title: 'Phụ lục kèm theo Thông tư số 32/2025/TT-BYT',
        href: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/32-byt-kem.pdf'
      }
    ]]
  ]);

  const getConfiguredAppendices = (href) => appendixLinksByDocumentHref.get(String(href || '').trim()) || [];

  const uniqueAppendices = (appendices) => {
    const seen = new Set();
    return appendices.filter((appendix) => {
      const key = `${normalizeText(appendix.title)}|${appendix.href}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const initDocumentBrowser = () => {
    const config = getDocumentPageConfig();
    if (!config) return;

    const section = document.querySelector('.section--soft');
    const container = section?.querySelector('.container');
    const accordion = container?.querySelector('.accordion');
    if (!section || !container || !accordion || container.querySelector('.document-browser')) return;

    const docs = Array.from(accordion.querySelectorAll('.accordion__item')).flatMap((item) => {
      const category = item.querySelector('.accordion__trigger span')?.textContent?.trim() || 'Tài liệu';
      const source = sourceFromCategory(category, config.type);
      return Array.from(item.querySelectorAll('.doc-link')).map((link, index) => {
        const title = link.querySelector('.doc-link__text')?.textContent?.trim() || link.textContent.trim();
        const date = extractDate(title);
        const href = link.getAttribute('href') || '#';
        const domAppendices = Array.from(link.closest('li')?.querySelectorAll('.doc-appendix__link') || []).map((appendixLink, appendixIndex) => ({
          id: `${normalizeText(category).replace(/\W+/g, '-')}-${index}-appendix-${appendixIndex}`,
          title: appendixLink.textContent.trim(),
          href: appendixLink.getAttribute('href') || '#'
        }));
        const appendices = uniqueAppendices([...domAppendices, ...getConfiguredAppendices(href)])
          .map((appendix, appendixIndex) => ({
            id: appendix.id || `${normalizeText(category).replace(/\W+/g, '-')}-${index}-appendix-${appendixIndex}`,
            ...appendix
          }));
        return {
          id: `${normalizeText(category).replace(/\W+/g, '-')}-${index}`,
          title,
          href,
          category,
          tag: shortCategory(category),
          source,
          decision: extractDecision(title),
          dateLabel: date.label,
          dateValue: date.value,
          searchText: normalizeText(`${title} ${category} ${source} ${extractDecision(title)} ${date.label}`),
          isPdf: /\.pdf(?:$|[?#])/i.test(href),
          appendices
        };
      });
    });

    if (!docs.length) return;

    const categories = [...new Set(docs.map(doc => doc.category))].sort((a, b) => a.localeCompare(b, 'vi'));
    const sources = [...new Set(docs.map(doc => doc.source))].sort((a, b) => a.localeCompare(b, 'vi'));

    const browser = document.createElement('section');
    browser.className = 'document-browser';
    browser.setAttribute('aria-label', config.title);
    browser.innerHTML = `
      <div class="document-browser__bar">
        <h2 class="document-browser__title">${config.title}</h2>
        <div class="document-browser__search">
          <input type="search" data-doc-search placeholder="${config.searchPlaceholder}" autocomplete="off">
          <button class="document-browser__clear" type="button" data-doc-clear>Xóa</button>
        </div>
      </div>
      <div class="document-browser__filters">
        <div class="document-browser__fields">
          <label class="document-field">
            <span>${config.categoryLabel}</span>
            <select data-doc-category></select>
          </label>
          <label class="document-field">
            <span>Số quyết định</span>
            <input type="text" data-doc-decision placeholder="${config.decisionPlaceholder}" autocomplete="off">
          </label>
          <label class="document-field">
            <span>Sắp xếp</span>
            <select data-doc-sort>
              <option value="newest">Ngày mới nhất</option>
              <option value="oldest">Ngày cũ nhất</option>
              <option value="az">Tên A-Z</option>
            </select>
          </label>
          <label class="document-field">
            <span>Nguồn</span>
            <select data-doc-source></select>
          </label>
        </div>
        <div class="document-browser__meta">
          <span data-doc-count></span>
          <button class="document-browser__reset" type="button" data-doc-reset>Xóa bộ lọc</button>
        </div>
      </div>
      <div class="document-browser__grid" data-doc-grid></div>
    `;

    const first = container.querySelector('.content-brief') || container.querySelector('.section__head') || accordion;
    container.insertBefore(browser, first);
    section.classList.add('section--document-browser-ready');

    const searchInput = browser.querySelector('[data-doc-search]');
    const categorySelect = browser.querySelector('[data-doc-category]');
    const decisionInput = browser.querySelector('[data-doc-decision]');
    const sourceSelect = browser.querySelector('[data-doc-source]');
    const sortSelect = browser.querySelector('[data-doc-sort]');
    const count = browser.querySelector('[data-doc-count]');
    const grid = browser.querySelector('[data-doc-grid]');

    categorySelect.append(createOption('', 'Tất cả'));
    categories.forEach(category => categorySelect.append(createOption(category, shortCategory(category))));
    sourceSelect.append(createOption('', 'Tất cả nguồn'));
    sources.forEach(source => sourceSelect.append(createOption(source, source)));

    const render = () => {
      const search = normalizeText(searchInput.value);
      const decision = normalizeText(decisionInput.value);
      const category = categorySelect.value;
      const source = sourceSelect.value;
      const sort = sortSelect.value;

      let results = docs.filter((doc) => {
        if (search && !doc.searchText.includes(search)) return false;
        if (decision && !normalizeText(doc.decision).includes(decision)) return false;
        if (category && doc.category !== category) return false;
        if (source && doc.source !== source) return false;
        return true;
      });

      results = results.sort((a, b) => {
        if (sort === 'oldest') return (a.dateValue || 0) - (b.dateValue || 0);
        if (sort === 'az') return a.title.localeCompare(b.title, 'vi');
        return (b.dateValue || 0) - (a.dateValue || 0);
      });

      count.textContent = `Tìm thấy ${results.length} tài liệu`;
      grid.innerHTML = results.length ? results.map((doc) => `
        <article class="document-card">
          <div class="document-card__top">
            <span class="document-card__tag">${doc.tag}</span>
            <time class="document-card__date">${doc.dateLabel}</time>
          </div>
          <h3 class="document-card__title">${doc.title}</h3>
          <dl class="document-card__details">
            <div><dt>Số quyết định:</dt><dd>${doc.decision}</dd></div>
            <div><dt>Ngày ban hành:</dt><dd>${doc.dateLabel}</dd></div>
            <div><dt>Nguồn:</dt><dd>${doc.source}</dd></div>
          </dl>
          <div class="document-card__actions${doc.appendices.length ? ' document-card__actions--has-appendix' : ''}">
            <a class="document-card__action" href="${doc.href}" target="_blank" rel="noopener noreferrer">${doc.isPdf ? 'Mở PDF' : 'Mở tài liệu'}</a>
            ${doc.appendices.length ? `<button class="document-card__action document-card__action--appendix" type="button" data-doc-appendix-toggle="${doc.id}" aria-expanded="false" aria-controls="doc-appendix-${doc.id}">Phụ lục đính kèm</button>` : ''}
            <button class="document-card__action document-card__action--soft" type="button" data-doc-copy="${doc.id}">Copy link</button>
          </div>
          ${doc.appendices.length ? `
            <div class="document-card__appendix" id="doc-appendix-${doc.id}" hidden>
              <div class="document-card__appendix-label">Phụ lục đính kèm</div>
              ${doc.appendices.map(appendix => `
                <a class="document-card__appendix-link" href="${appendix.href}" target="_blank" rel="noopener noreferrer">${appendix.title}</a>
              `).join('')}
            </div>
          ` : ''}
        </article>
      `).join('') : '<div class="document-browser__empty">Không tìm thấy tài liệu phù hợp với bộ lọc hiện tại.</div>';
    };

    browser.addEventListener('click', async (event) => {
      const appendixToggle = event.target.closest('[data-doc-appendix-toggle]');
      if (appendixToggle) {
        const panel = browser.querySelector(`#doc-appendix-${appendixToggle.dataset.docAppendixToggle}`);
        const isExpanded = appendixToggle.getAttribute('aria-expanded') === 'true';
        appendixToggle.setAttribute('aria-expanded', String(!isExpanded));
        if (panel) panel.hidden = isExpanded;
        return;
      }

      const copy = event.target.closest('[data-doc-copy]');
      if (copy) {
        const doc = docs.find(item => item.id === copy.dataset.docCopy);
        if (!doc) return;
        try {
          await navigator.clipboard.writeText(new URL(doc.href, window.location.href).href);
          copy.textContent = 'Đã copy';
          setTimeout(() => { copy.textContent = 'Copy link'; }, 1400);
        } catch (error) {
          window.prompt('Copy link tài liệu:', new URL(doc.href, window.location.href).href);
        }
      }
    });

    browser.querySelector('[data-doc-clear]').addEventListener('click', () => {
      searchInput.value = '';
      render();
      searchInput.focus();
    });

    browser.querySelector('[data-doc-reset]').addEventListener('click', () => {
      searchInput.value = '';
      decisionInput.value = '';
      categorySelect.value = '';
      sourceSelect.value = '';
      sortSelect.value = 'newest';
      render();
    });

    [searchInput, decisionInput].forEach(input => input.addEventListener('input', render));
    [categorySelect, sourceSelect, sortSelect].forEach(select => select.addEventListener('change', render));
    render();
  };

  initDocumentBrowser();

  // ---- 4. Back to top ----
  const toTop = document.querySelector('.to-top');
  if (toTop) {
    const updateToTop = () => {
      toTop.dataset.visible = String(window.scrollY > 600);
    };
    updateToTop();
    window.addEventListener('scroll', updateToTop, { passive: true });
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---- 5. Media slider ----
  document.querySelectorAll('[data-slider]').forEach(slider => {
    const track = slider.querySelector('.media-slider__track');
    const slides = Array.from(slider.querySelectorAll('.media-slider__slide'));
    const prevButton = slider.querySelector('[data-slider-prev]');
    const nextButton = slider.querySelector('[data-slider-next]');
    const dots = slider.querySelector('.media-slider__dots');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSmallScreen = window.matchMedia('(max-width: 767px)').matches;
    const intervalMs = Number(slider.dataset.sliderInterval || 3500);
    let currentIndex = 0;
    let autoplayId = null;

    if (!track || slides.length <= 1) return;

    const dotButtons = slides.map((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'media-slider__dot';
      dot.setAttribute('aria-label', `Chuyển đến ảnh ${index + 1}`);
      dot.addEventListener('click', () => {
        goTo(index);
        restartAutoplay();
      });
      dots?.appendChild(dot);
      return dot;
    });

    const render = () => {
      track.style.transform = `translateX(-${currentIndex * 100}%)`;
      slides.forEach((slide, index) => {
        slide.classList.toggle('is-active', index === currentIndex);
        slide.setAttribute('aria-hidden', String(index !== currentIndex));
      });
      dotButtons.forEach((dot, index) => {
        dot.setAttribute('aria-current', String(index === currentIndex));
      });
    };

    const goTo = (index) => {
      currentIndex = (index + slides.length) % slides.length;
      render();
    };

    const startAutoplay = () => {
      if (prefersReducedMotion || isSmallScreen) return;
      stopAutoplay();
      autoplayId = window.setInterval(() => goTo(currentIndex + 1), intervalMs);
    };

    const stopAutoplay = () => {
      if (autoplayId !== null) {
        window.clearInterval(autoplayId);
        autoplayId = null;
      }
    };

    const restartAutoplay = () => {
      stopAutoplay();
      startAutoplay();
    };

    prevButton?.addEventListener('click', () => {
      goTo(currentIndex - 1);
      restartAutoplay();
    });

    nextButton?.addEventListener('click', () => {
      goTo(currentIndex + 1);
      restartAutoplay();
    });

    slider.addEventListener('mouseenter', stopAutoplay);
    slider.addEventListener('mouseleave', startAutoplay);
    slider.addEventListener('focusin', stopAutoplay);
    slider.addEventListener('focusout', (event) => {
      if (!slider.contains(event.relatedTarget)) startAutoplay();
    });

    render();
    startAutoplay();
  });
})();

(function () {
  'use strict';

  const GOOGLE_SITE_ORIGIN = 'https://www.drugviewninhbinh.com';
  const GOOGLE_SITE_PAGE_MAP = {
    '/': '/trang-chủ',
    '/index.html': '/trang-chủ',
    '/trang-chu': '/trang-chủ',
    '/tra-cuu-thuoc.html': '/tra-cứu-thuốc',
    '/tra-cuu-thuoc': '/tra-cứu-thuốc',
    '/tra-cuu-thuoc-tiem-truyen.html': '/tra-cứu-thuốc/tra-cứu-thuốc',
    '/tra-cuu-thuoc-tiem-truyen': '/tra-cứu-thuốc/tra-cứu-thuốc',
    '/tra-cuu-thuoc-tuong-ky-tuong-hop.html': '/tra-cứu-thuốc/tương-hợp-tương-kỵ',
    '/tra-cuu-thuoc-tuong-ky-tuong-hop': '/tra-cứu-thuốc/tương-hợp-tương-kỵ',
    '/tra-cuu-thuoc-tuong-tac-thuoc.html': '/tra-cứu-thuốc/tương-tác-thuốc',
    '/tra-cuu-thuoc-tuong-tac-thuoc': '/tra-cứu-thuốc/tương-tác-thuốc',
    '/tra-cuu-lieu-mlct.html': '/tra-cứu-thuốc/hiệu-chỉnh-liều-theo-mlct',
    '/tra-cuu-lieu-mlct': '/tra-cứu-thuốc/hiệu-chỉnh-liều-theo-mlct',
    '/cap-nhat-chuyen-mon-duoc.html': '/cập-nhật-chuyên-môn-dược',
    '/cap-nhat-chuyen-mon-duoc': '/cập-nhật-chuyên-môn-dược',
    '/phac-do-dieu-tri.html': '/phác-đồ-điều-trị',
    '/phac-do-dieu-tri': '/phác-đồ-điều-trị',
    '/lien-he.html': '/liên-hệ',
    '/lien-he': '/liên-hệ'
  };
  const CONTENT_NAV_SELECTOR = '.site-main a[href]';
  const DIRECT_GOOGLE_SITE_LINK_SELECTOR = '.site-main a[href^="https://www.drugviewninhbinh.com/"][target="_blank"]';

  const params = new URLSearchParams(window.location.search);
  let isEmbedded = params.get('embed') === '1' || params.get('shell') === 'google-sites';

  try {
    isEmbedded = isEmbedded || window.self !== window.top;
  } catch (error) {
    isEmbedded = true;
  }

  if (!isEmbedded) return;

  document.documentElement.dataset.embedded = 'google-sites';
  document.body.dataset.embedded = 'google-sites';

  const normalizePath = (pathname) => {
    const path = pathname.replace(/\/+$/, '');
    return path || '/';
  };

  const getGoogleSiteHref = (href) => {
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return null;

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (error) {
      return null;
    }

    if (url.origin !== window.location.origin) return null;
    if (/^\/(docs|img|css|js)\//.test(url.pathname)) return null;

    const mappedPath = GOOGLE_SITE_PAGE_MAP[normalizePath(url.pathname)];
    if (!mappedPath) return null;

    const googleSiteUrl = new URL(mappedPath, GOOGLE_SITE_ORIGIN);
    if (url.hash) googleSiteUrl.hash = url.hash;
    return googleSiteUrl.href;
  };

  const markGoogleSitesLink = (link) => {
    const googleSiteHref = getGoogleSiteHref(link.getAttribute('href') || link.href);
    if (!googleSiteHref) return;

    link.dataset.netlifyHref = link.getAttribute('href') || link.href;
    link.href = googleSiteHref;
    link.target = '_blank';
    link.rel = 'noopener';
    link.dataset.googleSitesNav = 'true';
  };

  document.querySelectorAll(CONTENT_NAV_SELECTOR).forEach(markGoogleSitesLink);

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target?.nodeType === 1 ? event.target : null;
    const link = target?.closest?.(DIRECT_GOOGLE_SITE_LINK_SELECTOR);
    if (!link) return;

    const opened = window.open(link.href, '_blank');
    if (!opened) return;

    try {
      opened.opener = null;
    } catch (error) {}
    event.preventDefault();
  });
})();

(function () {
  'use strict';

  if (document.getElementById('drugview-mobile-safe-area-fix')) return;

  const style = document.createElement('style');
  style.id = 'drugview-mobile-safe-area-fix';
  style.textContent = `
    :root {
      --mobile-browser-chrome: 96px;
    }

    html,
    body {
      max-width: 100%;
      overflow-x: hidden;
    }

    body {
      min-height: 100vh;
      min-height: 100dvh;
    }

    .site-main,
    .section,
    .section--soft,
    .section--subtle {
      background: #fff;
    }

    .to-top {
      bottom: max(var(--sp-6, 1.5rem), calc(env(safe-area-inset-bottom) + var(--sp-4, 1rem)));
    }

    body[data-keyboard="true"] footer,
    body[data-keyboard="true"] .site-footer,
    body[data-keyboard="true"] .to-top {
      display: none !important;
    }

    @media (max-width: 900px) {
      .site-nav:not([data-open="true"]) .site-nav__list {
        transform: translateY(-8px) scale(.98);
      }
    }

    @media (max-width: 767px) {
      .site-footer {
        padding-bottom: calc(var(--sp-6, 1.5rem) + var(--mobile-browser-chrome) + env(safe-area-inset-bottom));
      }

      .to-top {
        right: var(--sp-4, 1rem);
        bottom: calc(var(--mobile-browser-chrome) + env(safe-area-inset-bottom));
      }
    }
  `;
  document.head.appendChild(style);
})();

(function () {
  'use strict';

  const FIELD_SELECTOR = 'input, textarea, select';
  const viewport = document.querySelector('meta[name="viewport"]');
  const originalViewport = viewport?.getAttribute('content') || '';
  let restoreTimer = null;

  const setKeyboardMode = (enabled) => {
    document.documentElement.dataset.keyboard = enabled ? 'true' : 'false';
    document.body.dataset.keyboard = enabled ? 'true' : 'false';
  };

  const lockViewport = () => {
    if (!viewport) return;

    const base = (originalViewport || 'width=device-width, initial-scale=1')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .filter(part => !/^(maximum-scale|user-scalable)\s*=/i.test(part));

    viewport.setAttribute('content', base.length ? `${base.join(', ')}, maximum-scale=1` : 'maximum-scale=1');
  };

  const restoreViewport = () => {
    if (!viewport || !originalViewport) return;
    viewport.setAttribute('content', originalViewport);
  };

  document.addEventListener('focusin', (event) => {
    if (!event.target?.matches?.(FIELD_SELECTOR)) return;

    window.clearTimeout(restoreTimer);
    setKeyboardMode(true);
    lockViewport();
  }, true);

  document.addEventListener('focusout', (event) => {
    if (!event.target?.matches?.(FIELD_SELECTOR)) return;

    restoreTimer = window.setTimeout(() => {
      if (document.activeElement?.matches?.(FIELD_SELECTOR)) return;
      setKeyboardMode(false);
      restoreViewport();
    }, 200);
  }, true);

})();

(function () {
  'use strict';

  const MESSAGE_TYPE = 'drugview-scroll-handoff';
  const MAX_DELTA = 900;
  const EDGE_TOLERANCE = 2;

  const clampDelta = (value) => {
    const delta = Number(value) || 0;
    if (!delta) return 0;
    return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  };

  const getScrollRoot = () => document.scrollingElement || document.documentElement;

  const getMaxScrollTop = (element) => Math.max(0, element.scrollHeight - element.clientHeight);

  const canScrollElement = (element, deltaY) => {
    if (!element) return false;
    const maxTop = getMaxScrollTop(element);
    if (maxTop <= EDGE_TOLERANCE) return false;
    if (deltaY < 0) return element.scrollTop > EDGE_TOLERANCE;
    if (deltaY > 0) return element.scrollTop < maxTop - EDGE_TOLERANCE;
    return false;
  };

  const getScrollableAncestor = (target) => {
    let node = target?.nodeType === 1 ? target : target?.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && getMaxScrollTop(node) > EDGE_TOLERANCE) {
        return node;
      }
      node = node.parentElement;
    }
    return getScrollRoot();
  };

  const tryScrollWindow = (targetWindow, deltaY) => {
    if (!targetWindow || targetWindow === window || !deltaY) return false;
    let before = null;

    try {
      before = targetWindow.scrollY;
    } catch (error) {}

    try {
      targetWindow.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
      return before === null || Math.abs(targetWindow.scrollY - before) > 0;
    } catch (error) {}

    try {
      targetWindow.scrollBy(0, deltaY);
      return before === null || Math.abs(targetWindow.scrollY - before) > 0;
    } catch (error) {}

    return false;
  };

  const postScrollHandoff = (deltaY, inputType) => {
    const payload = {
      type: MESSAGE_TYPE,
      deltaY,
      inputType,
      source: 'drugview',
      href: window.location.href
    };

    try {
      window.parent?.postMessage(payload, '*');
    } catch (error) {}

    try {
      if (window.top && window.top !== window.parent) window.top.postMessage(payload, '*');
    } catch (error) {}
  };

  const handoffScroll = (deltaY, inputType) => {
    const delta = clampDelta(deltaY);
    if (!delta) return false;

    if (tryScrollWindow(window.parent, delta) || tryScrollWindow(window.top, delta)) {
      return true;
    }

    postScrollHandoff(delta, inputType);
    return false;
  };

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== MESSAGE_TYPE || data.source !== 'drugview') return;

    const delta = clampDelta(data.deltaY);
    if (!delta) return;

    window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
  });

  let isEmbedded = false;
  try {
    isEmbedded = window.self !== window.top;
  } catch (error) {
    isEmbedded = true;
  }

  if (!isEmbedded) return;

  let lastTouchY = null;
  let lastTouchX = null;

  const shouldHandoff = (target, deltaY) => {
    const root = getScrollRoot();
    const scroller = getScrollableAncestor(target);

    if (scroller !== root && canScrollElement(scroller, deltaY)) return false;
    if (canScrollElement(root, deltaY)) return false;

    return true;
  };

  document.addEventListener('wheel', (event) => {
    const deltaY = clampDelta(event.deltaY);
    if (!deltaY || !shouldHandoff(event.target, deltaY)) return;

    if (handoffScroll(deltaY, 'wheel')) event.preventDefault();
  }, { passive: false });

  document.addEventListener('touchstart', (event) => {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    lastTouchY = touch.clientY;
    lastTouchX = touch.clientX;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    const touch = event.touches && event.touches[0];
    if (!touch || lastTouchY === null || lastTouchX === null) return;

    const deltaY = clampDelta(lastTouchY - touch.clientY);
    const deltaX = lastTouchX - touch.clientX;
    lastTouchY = touch.clientY;
    lastTouchX = touch.clientX;

    if (Math.abs(deltaY) < 4 || Math.abs(deltaY) < Math.abs(deltaX)) return;
    if (!shouldHandoff(event.target, deltaY)) return;

    if (handoffScroll(deltaY, 'touch')) event.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    lastTouchY = null;
    lastTouchX = null;
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    lastTouchY = null;
    lastTouchX = null;
  }, { passive: true });
})();

(function () {
  'use strict';

  const MEASUREMENT_ID = 'G-NC0D1PTZ3L';
  const CLICK_EVENT_NAME = 'site_click';
  const IS_LOCAL_PREVIEW = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  const TRACKABLE_SELECTOR = [
    'a',
    'button',
    '[role="button"]',
    '[data-analytics-click]',
    '.tool-link',
    '.feature-card',
    '.doc-link',
    '.accordion__trigger',
    '.drug-result-item',
    '.top-search-item',
    '.monthly-top-item',
    '.suggestions div',
    '.suggestions__item',
    '.selected-item',
    '.chip',
    '.group-row',
    '.mobile-interaction',
    'input[type="submit"]',
    'input[type="button"]'
  ].join(',');

  const PATH_ACTIONS = {
    'index.html': 'trang_chu',
    'tra-cuu-thuoc.html': 'tra_cuu_thuoc',
    'tra-cuu-thuoc-tiem-truyen.html': 'tiem_truyen',
    'tra-cuu-thuoc-tuong-ky-tuong-hop.html': 'tuong_ky_tuong_hop',
    'tra-cuu-thuoc-tuong-tac-thuoc.html': 'tuong_tac_thuoc',
    'tra-cuu-lieu-mlct.html': 'hieu_chinh_lieu_theo_mlct',
    'cap-nhat-chuyen-mon-duoc.html': 'cap_nhat_chuyen_mon_duoc',
    'phac-do-dieu-tri.html': 'phac_do_dieu_tri',
    'lien-he.html': 'lien_he'
  };

  const FRAME_CONFIGS = [
    { selector: '#tiem-truyen-frame', frameName: 'tiem_truyen', title: 'Tiêm truyền' },
    { selector: '#tuong-ky-frame', frameName: 'tuong_ky_tuong_hop', title: 'Tương kỵ - tương hợp' },
    { selector: '#tuong-tac-frame', frameName: 'tuong_tac_thuoc', title: 'Tương tác thuốc' }
  ];

  window.__drugviewAnalyticsEvents = window.__drugviewAnalyticsEvents || [];
  const recentEventKeys = new Map();

  if (IS_LOCAL_PREVIEW) {
    window.gtag = window.gtag || function () {};
  } else {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };

    if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      document.head.appendChild(script);
    }

    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      send_page_view: true
    });
  }

  const cleanText = (value, maxLength = 120) =>
    (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);

  const isElement = (target) => target && target.nodeType === 1;
  const closest = (target, selector) =>
    isElement(target) && typeof target.closest === 'function' ? target.closest(selector) : null;
  const matches = (target, selector) =>
    isElement(target) && typeof target.matches === 'function' && target.matches(selector);

  const getClassName = (element) => {
    if (!element) return '';
    if (typeof element.className === 'string') return cleanText(element.className, 100);
    return cleanText(element.className?.baseVal || '', 100);
  };

  const getAbsoluteUrl = (element) => {
    const href = element?.getAttribute?.('href');
    if (!href) return null;
    try {
      return new URL(href, window.location.href);
    } catch (error) {
      return null;
    }
  };

  const slugify = (value, maxLength = 48) => {
    const slug = cleanText(value, maxLength * 2)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLength)
      .replace(/_+$/g, '');
    return slug || 'unknown';
  };

  const normalizeEventName = (prefix, value) =>
    `${prefix}_${slugify(value, 34)}`.slice(0, 40).replace(/_+$/g, '');

  const getPathAction = (absoluteUrl) => {
    if (!absoluteUrl) return '';
    const fileName = absoluteUrl.pathname.split('/').filter(Boolean).pop() || 'index.html';
    return PATH_ACTIONS[fileName] || slugify(fileName.replace(/\.[a-z0-9]+$/i, ''), 32);
  };

  const getElementLabel = (element, fallback = '') => cleanText(
    element?.dataset?.analyticsLabel ||
    element?.dataset?.value ||
    element?.getAttribute?.('aria-label') ||
    element?.querySelector?.('.tool-link__label, .doc-link__text, .feature-card__title, .accordion__trigger span, .drug-result-name, .selected-item__name, .chip__label, .search-term, .monthly-term')?.textContent ||
    element?.textContent ||
    fallback ||
    element?.id ||
    getClassName(element),
    120
  );

  const getClickArea = (element) => {
    if (closest(element, 'header, nav, .site-header, .site-nav')) return 'navigation';
    if (closest(element, 'footer, .site-footer')) return 'footer';
    if (closest(element, '.hero')) return 'hero';
    if (closest(element, '.tool-list, .tool-link')) return 'tool_list';
    if (closest(element, '.doc-list, .doc-link')) return 'document_list';
    if (closest(element, '.accordion')) return 'accordion';
    if (closest(element, '.feature-card, .tool-card, .card')) return 'card';
    if (closest(element, '.media-slider')) return 'media_slider';
    if (closest(element, '.drug-result-item, .top-search-item, .monthly-top-item, .suggestions, .suggestions__item, .selected-item, .chip, .group-row, .mobile-interaction')) return 'iframe';
    return 'content';
  };

  const getTrackedElement = (target) => {
    return closest(target, TRACKABLE_SELECTOR);
  };

  const getContentType = (element, area, absoluteUrl) => {
    if (closest(element, '.doc-link')) return 'document';
    if (closest(element, '.tool-link')) return 'tool';
    if (closest(element, '.accordion__trigger')) return 'accordion';
    if (closest(element, '.drug-result-item, .group-row, .mobile-interaction')) return 'result';
    if (closest(element, '.top-search-item, .monthly-top-item')) return 'quick_search';
    if (closest(element, '.suggestions, .suggestions__item')) return 'suggestion';
    if (area === 'navigation') return 'navigation';
    if (absoluteUrl) return 'link';
    return 'button';
  };

  const buildBasePayload = (element, options = {}) => {
    const absoluteUrl = options.absoluteUrl || getAbsoluteUrl(element);
    const label = getElementLabel(element, options.label || absoluteUrl?.href || '');
    const area = options.forcedArea || getClickArea(element);
    const itemId = options.itemId || getPathAction(absoluteUrl) || slugify(label, 48);
    const outbound = Boolean(absoluteUrl && absoluteUrl.hostname !== window.location.hostname);
    const clickType = options.clickType || (absoluteUrl ? (outbound ? 'external_link' : 'internal_link') : 'button');

    return {
      click_text: label,
      click_area: area,
      click_type: clickType,
      link_url: absoluteUrl ? absoluteUrl.href : '',
      link_domain: absoluteUrl ? absoluteUrl.hostname : '',
      link_id: element?.id || '',
      link_classes: getClassName(element),
      outbound,
      item_name: options.itemName || label,
      item_id: itemId,
      item_category: options.itemCategory || area,
      content_type: options.contentType || getContentType(element, area, absoluteUrl),
      event_action: options.eventAction || 'click',
      source_context: options.sourceContext || 'page',
      frame_name: options.frameName || '',
      frame_title: options.frameTitle || '',
      search_term: options.searchTerm || '',
      page_location: window.location.href,
      page_title: document.title,
      page_path: window.location.pathname || '/',
      transport_type: 'beacon'
    };
  };

  const getDetailEventName = (element, payload, options = {}) => {
    if (options.forcedEventName) return options.forcedEventName;
    if (payload.source_context === 'iframe') return 'iframe_click';
    if (payload.click_area === 'navigation') return normalizeEventName('nav', payload.item_id || payload.item_name);
    if (payload.content_type === 'tool') return normalizeEventName('tool', payload.item_id || payload.item_name);
    if (payload.content_type === 'document') return 'document_click';
    if (payload.content_type === 'accordion') return 'accordion_toggle';
    if (closest(element, '.to-top')) return 'back_to_top';
    if (payload.click_area === 'footer') return normalizeEventName('footer', payload.item_id || payload.item_name);
    return 'content_click';
  };

  const sendAnalyticsEvent = (detailEventName, payload) => {
    const cleanPayload = Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? cleanText(value, 160) : value])
    );
    if (detailEventName === 'iframe_search') {
      const duplicateKey = [
        detailEventName,
        cleanPayload.frame_name,
        cleanPayload.search_term || cleanPayload.item_name || cleanPayload.item_id
      ].join('|');
      const now = Date.now();
      const lastSentAt = recentEventKeys.get(duplicateKey) || 0;
      if (now - lastSentAt < 700) return;
      recentEventKeys.set(duplicateKey, now);
    }
    const eventsToSend = [CLICK_EVENT_NAME];
    if (detailEventName && detailEventName !== CLICK_EVENT_NAME) eventsToSend.push(detailEventName);

    eventsToSend.forEach((eventName) => {
      const eventPayload = { ...cleanPayload };
      if (IS_LOCAL_PREVIEW) {
        window.__drugviewAnalyticsEvents.push({
          event_name: eventName,
          payload: eventPayload,
          timestamp: new Date().toISOString()
        });
      } else {
        window.gtag('event', eventName, eventPayload);
      }
    });
  };

  const trackElement = (element, options = {}) => {
    if (!element || closest(element, '[data-analytics-ignore]')) return;
    const payload = buildBasePayload(element, options);
    if (!payload.click_text && !payload.link_url && !payload.search_term) return;
    sendAnalyticsEvent(getDetailEventName(element, payload, options), payload);
  };

  const getSearchTerm = (scope) => cleanText(
    scope?.querySelector?.('#searchInput, input[type="search"], input[type="text"], input:not([type])')?.value,
    100
  );

  const getIframeEventName = (element) => {
    if (matches(element, '#searchButton, #btnSearch, .btn-primary') || /tra cứu|tìm kiếm/i.test(getElementLabel(element))) return 'iframe_search';
    if (closest(element, '.drug-result-item, .group-row, .mobile-interaction')) return 'iframe_result_select';
    if (closest(element, '.top-search-item, .monthly-top-item')) return 'iframe_quick_search';
    if (closest(element, '.suggestions, .suggestions__item')) return 'iframe_suggestion_select';
    if (closest(element, '.delete-btn, .chip__remove')) return 'iframe_item_remove';
    return 'iframe_click';
  };

  const bindFrameTracking = (frame, config) => {
    const bind = () => {
      try {
        const frameWindow = frame.contentWindow;
        const doc = frame.contentDocument || frameWindow?.document;
        if (!doc || doc.__drugviewTrackingBound) return;
        doc.__drugviewTrackingBound = true;

        const baseOptions = {
          sourceContext: 'iframe',
          frameName: config.frameName,
          frameTitle: config.title,
          itemCategory: config.frameName
        };

        doc.addEventListener('click', (event) => {
          const element = getTrackedElement(event.target);
          if (!element || closest(element, '[data-analytics-ignore]')) return;
          const eventName = getIframeEventName(element);
          trackElement(element, {
            ...baseOptions,
            forcedEventName: eventName,
            forcedArea: eventName === 'iframe_result_select' ? 'iframe_result' : 'iframe',
            contentType: eventName.replace(/^iframe_/, ''),
            eventAction: eventName.replace(/^iframe_/, ''),
            searchTerm: getSearchTerm(doc)
          });
        }, { capture: true });

        doc.addEventListener('submit', (event) => {
          const form = event.target;
          if (!form || !matches(form, 'form')) return;
          sendAnalyticsEvent('iframe_search', buildBasePayload(form, {
            ...baseOptions,
            label: 'submit_search',
            forcedArea: 'iframe',
            clickType: 'form_submit',
            contentType: 'search',
            eventAction: 'search',
            searchTerm: getSearchTerm(form) || getSearchTerm(doc)
          }));
        }, { capture: true });

        doc.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' || !matches(event.target, 'input')) return;
          window.setTimeout(() => {
            sendAnalyticsEvent('iframe_search', buildBasePayload(event.target, {
              ...baseOptions,
              label: 'enter_search',
              forcedArea: 'iframe',
              clickType: 'keyboard',
              contentType: 'search',
              eventAction: 'search',
              searchTerm: getSearchTerm(doc)
            }));
          }, 0);
        }, { capture: true });
      } catch (error) {}
    };

    frame.addEventListener('load', bind);
    window.setTimeout(bind, 0);
    window.setTimeout(bind, 1000);
    window.setTimeout(bind, 2500);
  };

  document.addEventListener('click', (event) => {
    const element = getTrackedElement(event.target);
    trackElement(element);
  }, { capture: true });

  FRAME_CONFIGS.forEach((config) => {
    document.querySelectorAll(config.selector).forEach((frame) => bindFrameTracking(frame, config));
  });
})();
