declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const GA_MEASUREMENT_ID = "G-BP9B4GDZES";

// Only loads GA4 in production builds — otherwise every local `npm run dev`
// session and test run would ship real events into the live property.
export function initAnalytics(): void {
  if (!import.meta.env.PROD) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  const dataLayer = (window.dataLayer = window.dataLayer || []);
  window.gtag = (...args: unknown[]) => {
    dataLayer.push(args);
  };
  window.gtag("js", new Date());
  // send_page_view: false — this is a client-side-routed SPA, so a single
  // automatic pageview on script load would never reflect in-app navigation.
  // trackPageView() below fires the real page_view on every route change instead.
  //
  // transport_url + first_party_collection: true route the actual collect
  // beacon through thewalletaudit.com/g/collect (a Cloudflare Worker proxy,
  // see cloudflare/ga-proxy/) instead of straight to google-analytics.com.
  // Confirmed live that gtag.js loads fine but that collect call gets
  // silently dropped by ad/privacy blockers targeting Google's domain —
  // this makes the same hit look first-party so it isn't filtered.
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    transport_url: "https://thewalletaudit.com",
    first_party_collection: true,
  });
}

export function trackEvent(name: string, params?: Record<string, string | number>): void {
  window.gtag?.("event", name, params);
}

export function trackPageView(path: string): void {
  window.gtag?.("event", "page_view", { page_path: path });
}
