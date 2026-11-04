# simplykrisp-produce-guide

Two customer-facing tools, one Vercel project.

| Path | What it is |
|---|---|
| `/` | Produce Storage Guide — how to store each item so it lasts |
| `/seasonal` | What's In Season — ZIP-based seasonality, ethylene flags, nearby markets |
| `/api/markets` | Serverless proxy for the USDA Local Food Directory |
| `/lab` | Lab Notebook — side-by-side fridge tests, rendered from `lab/runs.json` |
| `/lab/crisper-map` | Printable one-page Crisper Drawer Map; `?partner=Name` adds a partner credit line |

Both are embedded into Shopify pages as iframes. `vercel.json` sets
`X-Frame-Options: ALLOWALL` and `frame-ancestors *` specifically to allow that —
do not tighten those without updating the Shopify pages first.

## Routing

`vercel.json` rewrites everything to `/index.html` so the storage guide can own
its client-side routes. The rewrite **must** keep excluding `api/` and
`seasonal`:

```json
{ "source": "/((?!api/|seasonal|lab).*)", "destination": "/index.html" }
```

Without that exclusion a request for `/seasonal` gets the storage guide instead,
and `/api/markets` returns HTML rather than JSON.

Note that Vercel serves `/seasonal` without a trailing slash, so every
same-project reference inside `seasonal/index.html` is root-absolute
(`/seasonal/produce.json`, not `./produce.json`). Relative paths silently
resolve one level too high and 404.

## The lab notebook

Static page; add a run by appending an object to `lab/runs.json` (`id`, `title`,
`status` = planned | in progress | complete, `started`, `produce`, `question`, `result`,
`images[]` of `{src, alt, caption}`). Put photos in `lab/img/` and reference them
root-absolute (`/lab/img/broccoli-01-day7.jpg`). Update `meta.updated`.

## The seasonal page

Self-contained: one HTML file with inline CSS and JS, plus four data files.

| File | Purpose |
|---|---|
| `seasonal/index.html` | The whole page |
| `seasonal/zip-to-state.js` | Offline ZIP → state lookup, no API key |
| `seasonal/produce.json` | 56 items, extracted from the Storage Guide build so the tips match exactly |
| `seasonal/seasonality.json` | 9 growing regions × month × crop |
| `seasonal/vendor/` | Leaflet 1.9.4, vendored rather than CDN-loaded |

Leaflet is committed here on purpose. This page is the target of a printed QR
code on compost pails, so it needs to still work years from now without
depending on a third-party CDN staying up. Verified sha256:
`leaflet.js` = `20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=`,
`leaflet.css` = `p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=`.

Map tiles come from OpenStreetMap, credited in the footer. Fine at this traffic
level; swap the tile URL in `ensureMap()` for a paid provider if it scales.

### Deep links

- `?zip=54220` — pre-fills and skips to results, for partner-specific sticker runs
- `?radius=25` — sets the market search distance, snapped to the nearest option

## The USDA proxy

`api/markets.js` queries four directories (`farmersmarket`, `csa`,
`onfarmmarket`, `foodhub`) in parallel. The USDA endpoint is public and
unauthenticated but returns 403 without browser-like headers, and sends no CORS
headers — hence the proxy.

Two things that bite:

- **`location_x` is longitude and `location_y` is latitude.** No geocoding step.
- **USDA's radius is approximate.** A 25-mile query returns listings ~30 miles
  out, so the page re-filters client-side on the distance it displays.

Each directory call is capped at 7s because Vercel kills the function at 10s; a
slow directory returns empty rather than failing the whole response. Results are
capped at 12 per type, so a 100-mile search is the 12 nearest of each, not
exhaustive.

`server.py` is the local-dev equivalent (Python stdlib only, no deps). It is not
deployed. Its radius parsing is deliberately identical to `api/markets.js` —
verified across 19 edge cases — so a bug can't appear on only one of them.

```bash
python3 server.py          # proxy on :8000
python3 -m http.server 8080
# then set API_BASE to 'http://localhost:8000' in seasonal/index.html
```

## Updating the data

- **Storage tips** — re-extract `seasonal/produce.json` from the Storage Guide
  build so the two never drift apart.
- **Seasonality** — `seasonal/seasonality.json` is compiled from the
  [ACL regional chart](https://acl.gov/sites/default/files/nutrition/SeasonalProduceChartByRegion.pdf),
  [Seasonal Food Guide](https://www.seasonalfoodguide.org/), and state extension
  calendars for [Wisconsin](https://health.extension.wisc.edu/files/2024/10/Season_Availability_Chart-English.pdf),
  [Utah](https://extension.usu.edu/yardandgarden/research/local-fruit-and-vegetable-availability-along-the-wasatch-front),
  [Georgia](https://site.extension.uga.edu/aaecext/2025/12/georgias-month-by-month-produce-guide/),
  and [California](https://cdn.agclassroom.org/ca/resources/gardens/seasonalchart.pdf).
  Sources are listed in the file's `meta.sources`.

## Attribution

Store links carry UTM parameters (`utm_source=produce-guide`) so Shopify can
attribute sessions that start on these tools. Page views themselves do not
appear in Shopify analytics, because the content is served from Vercel rather
than from the store.

## My Krisper (pilot)

`/krisper` (also `/crisper`) is the "My Krisper" tester-facing pilot: people forward grocery order emails and see
what to use first. Shelf-life ranges come from the Storage Guide (56 items,
built into `api/_crisper/catalog.js` by `npm run catalog`).

How it works:

1. Sign up with an email (no password). The dashboard link holds a derived key,
   `HMAC(CRISPER_SECRET, userId)`; only its hash is stored.
2. Each tester gets `<postmark-hash>+<slug>@inbound.postmarkapp.com`, and a
   Gmail/Outlook/iCloud filter forwards store emails to it.
3. Postmark posts each email to `/api/crisper/inbound?token=…`. A rule-based
   parser (`api/_crisper/parser.js`) keeps the produce names, quantities and date,
   and the email itself is never stored. Gmail's forwarding code shows up on the
   setup screen.
4. Order confirmations become "On the way" items, and the final receipt replaces them.
5. A daily cron (`/api/crisper/cron`, 14:00 UTC) sends Klaviyo events
   (`Krisper Use Soon`, `Krisper Krisp Change Due`), and Klaviyo flows send the emails.
6. `/krisper/admin` shows the pilot scorecard (needs `CRISPER_ADMIN_KEY`).

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres. Tables are created on first request |
| `CRISPER_SECRET` | Derives dashboard keys. Never change it after launch |
| `CRISPER_INBOUND_ADDRESS` | Postmark inbound address, e.g. `abc123@inbound.postmarkapp.com` |
| `CRISPER_INBOUND_TOKEN` | Shared secret in the Postmark webhook URL |
| `CRON_SECRET` | Vercel sends it to the cron endpoint |
| `CRISPER_ADMIN_KEY` | Unlocks `/crisper/admin` |
| `KLAVIYO_PRIVATE_KEY` | Optional. Without it, events are logged and skipped |
| `KLAVIYO_CRISPER_LIST_ID` | Optional. Marketing-consent list |
| `CRISPER_PUBLIC_ORIGIN` | Defaults to `https://guide.simplykrisp.com` |

Local dev (embedded Postgres, no accounts needed):

```bash
npm install
npm test                                   # parser + end-to-end API tests
CRISPER_INBOUND_ADDRESS=dev@inbound.postmarkapp.com CRISPER_ADMIN_KEY=dev-admin node dev/server.mjs
```
