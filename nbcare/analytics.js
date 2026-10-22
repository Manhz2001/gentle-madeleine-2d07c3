(function () {
  'use strict';

  if (window.NBCareAnalytics) return;

  const measurementId = 'G-NC0D1PTZ3L';
  const local = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  const pageLocation = window.location.origin + window.location.pathname;
  const pageTitle = 'NBCare — BVĐK tỉnh Ninh Bình';
  const allowedEvents = new Set(['nbcare_open', 'nbcare_close']);
  const allowedEntryPoints = new Set(['module', 'popup']);

  function track(eventName, params) {
    if (!allowedEvents.has(eventName)) return;
    const input = params && typeof params === 'object' ? params : {};
    const safe = {module_name: 'nbcare'};
    if (allowedEntryPoints.has(input.entry_point)) safe.entry_point = input.entry_point;
    if (local) {
      window.__nbcareAnalyticsEvents.push({event_name: eventName, params: safe});
      return;
    }
    window.gtag('event', eventName, {
      ...safe,
      send_to: measurementId,
      page_location: pageLocation,
      page_title: pageTitle
    });
  }

  window.NBCareAnalytics = Object.freeze({track});

  if (local) {
    window.__nbcareAnalyticsEvents = window.__nbcareAnalyticsEvents || [];
    window.__nbcareAnalyticsEvents.push({
      event_name: 'page_view',
      params: {page_location: pageLocation, page_title: pageTitle}
    });
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + measurementId + '"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
  }
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: true,
    page_location: pageLocation,
    page_title: pageTitle
  });
})();
