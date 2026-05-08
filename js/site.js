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
    '/tra-cuu-thuoc.html': '/tra-cứu-thông-tin-thuốc',
    '/tra-cuu-thuoc': '/tra-cứu-thông-tin-thuốc',
    '/tra-cuu-thuoc-tiem-truyen.html': '/tra-cứu-thông-tin-thuốc/tiêm-truyền',
    '/tra-cuu-thuoc-tiem-truyen': '/tra-cứu-thông-tin-thuốc/tiêm-truyền',
    '/tra-cuu-thuoc-tuong-ky-tuong-hop.html': '/tra-cứu-thông-tin-thuốc/tương-hợp-tương-kỵ',
    '/tra-cuu-thuoc-tuong-ky-tuong-hop': '/tra-cứu-thông-tin-thuốc/tương-hợp-tương-kỵ',
    '/tra-cuu-thuoc-tuong-tac-thuoc.html': '/tra-cứu-thông-tin-thuốc/tương-tác-thuốc',
    '/tra-cuu-thuoc-tuong-tac-thuoc': '/tra-cứu-thông-tin-thuốc/tương-tác-thuốc',
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
