declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const GA_MEASUREMENT_ID = "G-MVE5H49V1S";

// Only loads GA4 in production builds — otherwise every local `npm run dev`
// session and test run would ship real events into the live property.
export function initAnalytics(): void {
  if (!import.meta.env.PROD) return;

  window.dataLayer = window.dataLayer || [];
  // This MUST push the `arguments` object itself, never a rest-parameter
  // array. gtag.js decides whether a dataLayer entry is a command by checking
  // Object.prototype.toString.call(entry) === "[object Arguments]"; a real
  // Array looks like plain data and is silently dropped.
  //
  // That one detail is why this property recorded zero hits for its entire
  // lifetime. `function gtag(...args) { dataLayer.push(args) }` reads as an
  // equivalent modernisation of Google's snippet, and the queued dataLayer
  // looks completely correct when you inspect it, but gtag.js never
  // recognised consent/js/config/event as commands — so it loaded, ran, and
  // never configured a measurement id or attempted a single request.
  // Verified on production 2026-08-05: zero /g/collect requests before,
  // two immediately after re-issuing the same commands in this form.
  const gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as (...args: unknown[]) => void;
  window.gtag = gtag;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  // Consent must be set before `js`/`config` — gtag.js reads it at config
  // time and locks in behavior for the session. We have no cookie banner
  // or CMP, and no EEA-specific handling, so we grant outright rather than
  // silently defaulting to "denied" by omission.
  gtag("consent", "default", {
    ad_storage: "granted",
    analytics_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  });

  gtag("js", new Date());

  // send_page_view: false — this is a client-side-routed SPA, so a single
  // automatic pageview on script load would never reflect in-app navigation.
  // trackPageView() below fires the real page_view on every route change instead.
  //
  // Deliberately NOT using transport_url here for now. A Cloudflare Worker
  // proxy exists at cloudflare/ga-proxy/ to route collect hits through our
  // own domain for ad-blocker resistance, but the previous data stream
  // never recorded a single hit even with the proxy verified working
  // end-to-end — so we're isolating variables: confirm plain gtag.js
  // reaches Google directly first, then layer the proxy back in once
  // that's proven, rather than debug both at once.
  gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
  });
}

export function trackEvent(name: string, params?: Record<string, string | number>): void {
  window.gtag?.("event", name, params);
}

export function trackPageView(path: string): void {
  window.gtag?.("event", "page_view", { page_path: path });
}
