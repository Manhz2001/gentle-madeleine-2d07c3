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
