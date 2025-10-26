// Simple analytics wrapper helpers (renamed from gtag.js to avoid client-side blockers)
export const GA_MEASUREMENT_ID = 'G-24QFLGY6P5';

// Safe wrapper around window.gtag
export function gtag(){
  if (typeof window === 'undefined') return;
  if (!window.gtag) return;
  try {
    window.gtag.apply(null, arguments);
  } catch (e) {
    // swallow errors in environments where gtag isn't available yet
    // console.debug('gtag error', e);
  }
}

export function pageview(path) {
  if (!path) path = window?.location?.pathname || '/';
  if (typeof window === 'undefined') return;
  if (!window.gtag) return;
  window.gtag('config', GA_MEASUREMENT_ID, { page_path: path });
}

export function event(action, params) {
  if (typeof window === 'undefined') return;
  if (!window.gtag) return;
  window.gtag('event', action, params);
}

export default { GA_MEASUREMENT_ID, gtag, pageview, event };
