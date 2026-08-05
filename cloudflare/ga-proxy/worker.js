// Proxies GA4's collect endpoint through our own domain so it looks
// first-party to the browser. Ad blockers and privacy extensions filter by
// domain (google-analytics.com is one of the most commonly blocklisted),
// not by payload — routing the same hit through thewalletaudit.com/g/collect
// sails past those lists without changing what data GA4 receives.
//
// Paired with gtag's `transport_url` + `first_party_collection: true` in
// frontend/src/utils/analytics.ts, which is what makes gtag.js send hits
// here instead of straight to Google.

const GA_COLLECT_ORIGIN = "https://www.google-analytics.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/g/collect") {
      return new Response("Not found", { status: 404 });
    }

    const target = new URL(GA_COLLECT_ORIGIN + "/g/collect" + url.search);

    const headers = new Headers(request.headers);
    headers.delete("host");
    // GA4 uses this for geolocation; Cloudflare gives us the real client IP
    // here even though the request now arrives from our Worker's IP.
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) headers.set("x-forwarded-for", clientIp);

    const isBodyless = request.method === "GET" || request.method === "HEAD";
    const response = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: isBodyless ? undefined : request.body,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
};
