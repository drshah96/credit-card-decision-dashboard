# GA4 first-party collect proxy

Routes GA4's `/g/collect` beacon through `thewalletaudit.com` instead of
`google-analytics.com`, so it isn't caught by domain-based ad/privacy
blockers. See `worker.js` for why.

## Deploy

Requires a Cloudflare account with the `thewalletaudit.com` zone (same
account already proxying DNS for the site).

```bash
cd cloudflare/ga-proxy
npx wrangler login      # opens a browser to authorize your Cloudflare account
npx wrangler deploy
```

`wrangler deploy` reads `wrangler.toml` and registers the route
automatically — no manual dashboard step needed. Re-run `npx wrangler
deploy` from this directory any time `worker.js` changes.

## Verify

After deploying, load the site and check dev tools Network tab for a
`thewalletaudit.com/g/collect?...` request returning `204`. In GA4, Admin →
Data Streams → the web stream should stop showing "No data received" within
a day or so of real traffic.
