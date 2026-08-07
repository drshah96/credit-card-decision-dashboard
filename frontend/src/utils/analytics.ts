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

  // The script fetch is deferred until after the page has loaded and the
  // main thread is idle. gtag.js is ~170 KB transfer — bigger than this
  // entire app's bundle — and when injected at boot it competes with the
  // code that actually paints the page, which showed up directly in mobile
  // Lighthouse (LCP is a text node waiting on JS execution). Deferral is
  // free: the gtag() stub above queues every command into dataLayer, and
  // gtag.js replays the whole queue when it eventually arrives, so consent
  // ordering, config, and any page_views fired before load are all
  // delivered exactly as if the script had been there from the start.
  const injectGtagScript = () => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  };
  const scheduleInject = () => {
    // typeof-check rather than `in`: the DOM lib types requestIdleCallback as
    // always present, so an `in` guard narrows the else branch to `never` —
    // but Safari and jsdom genuinely lack it at runtime.
    if (typeof window.requestIdleCallback === "function") {
      // timeout so a busy page still loads analytics within a few seconds
      window.requestIdleCallback(injectGtagScript, { timeout: 4000 });
    } else {
      window.setTimeout(injectGtagScript, 1500);
    }
  };
  if (document.readyState === "complete") {
    scheduleInject();
  } else {
    window.addEventListener("load", scheduleInject, { once: true });
  }

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
