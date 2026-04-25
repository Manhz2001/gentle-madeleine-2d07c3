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
      if (prefersReducedMotion) return;
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

  if (document.getElementById('drugview-mobile-safe-area-fix')) return;

  const style = document.createElement('style');
  style.id = 'drugview-mobile-safe-area-fix';
  style.textContent = `
    :root {
      --mobile-browser-chrome: 96px;
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

  const MEASUREMENT_ID = 'G-NC0D1PTZ3L';
  const CLICK_EVENT_NAME = 'site_click';

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

  const cleanText = (value, maxLength = 120) =>
    (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);

  const getClickArea = (element) => {
    if (element.closest('header, nav, .site-header, .site-nav')) return 'navigation';
    if (element.closest('footer, .site-footer')) return 'footer';
    if (element.closest('.hero')) return 'hero';
    if (element.closest('.feature-card, .tool-card, .card')) return 'card';
    if (element.closest('.media-slider')) return 'media_slider';
    return 'content';
  };

  const getTrackedElement = (target) => {
    if (!(target instanceof Element)) return null;
    return target.closest('a, button, [role="button"], [data-analytics-click]');
  };

  document.addEventListener('click', (event) => {
    const element = getTrackedElement(event.target);
    if (!element || element.closest('[data-analytics-ignore]')) return;

    const href = element.getAttribute('href');
    const absoluteUrl = href ? new URL(href, window.location.href) : null;
    const linkText = cleanText(
      element.dataset.analyticsLabel ||
      element.getAttribute('aria-label') ||
      element.textContent ||
      href ||
      element.id ||
      element.className
    );

    if (!linkText && !absoluteUrl) return;

    const outbound = absoluteUrl ? absoluteUrl.hostname !== window.location.hostname : false;

    window.gtag('event', CLICK_EVENT_NAME, {
      click_text: linkText,
      click_area: getClickArea(element),
      click_type: absoluteUrl ? (outbound ? 'external_link' : 'internal_link') : 'button',
      link_url: absoluteUrl ? absoluteUrl.href : '',
      link_domain: absoluteUrl ? absoluteUrl.hostname : '',
      link_id: element.id || '',
      link_classes: typeof element.className === 'string' ? cleanText(element.className, 100) : '',
      outbound,
      page_location: window.location.href,
      page_title: document.title,
      transport_type: 'beacon'
    });
  }, { capture: true });
})();
