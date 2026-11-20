# simplykrisp-produce-guide

Two customer-facing tools, one Vercel project.

| Path | What it is |
|---|---|
| `/` | Produce Storage Guide — how to store each item so it lasts |
| `/seasonal` | What's In Season — ZIP-based seasonality, ethylene flags, nearby markets |
| `/api/markets` | Serverless proxy for the USDA Local Food Directory |
| `/lab` | Lab Notebook — side-by-side fridge tests, rendered from `lab/runs.json` |
| `/lab/crisper-map` | Printable one-page Crisper Drawer Map; `?partner=Name` adds a partner credit line |
| `/partners` | Box Storage Guide for CSAs: paste a box list, copy a storage guide for the newsletter or print it |

Both are embedded into Shopify pages as iframes. `vercel.json` sets
`X-Frame-Options: ALLOWALL` and `frame-ancestors *` specifically to allow that —
do not tighten those without updating the Shopify pages first.

## Routing

`vercel.json` rewrites everything to `/index.html` so the storage guide can own
its client-side routes. The rewrite **must** keep excluding `api/` and
`seasonal`:

```json
{ "source": "/((?!api/|seasonal|lab|crisper|krisper|produce|sitemap\\.xml|robots\\.txt).*)", "destination": "/index.html" }
```

Without that exclusion a request for `/seasonal` gets the storage guide instead,
and `/api/markets` returns HTML rather than JSON.

Note that Vercel serves `/seasonal` without a trailing slash, so every
same-project reference inside `seasonal/index.html` is root-absolute
(`/seasonal/produce.json`, not `./produce.json`). Relative paths silently
resolve one level too high and 404.

## Why it goes bad (`/produce`)

Static, crawlable pages for when storage didn't work: what each kind of
spoilage looks like, what causes it, whether it's still OK to eat, and how to
prevent it next time.

- Content lives in `data/spoilage.json`: `sources` (every claim cites one),
  `causes`, `verdicts` (eat | cook | trim | toss) and `items[]`, each with
  `failures[]` ranked most common first.
- Storage tips, shelf life, "keep away from" and Krisp wording are **not**
  repeated there. The generator pulls them from `seasonal/produce.json`,
  scrap ideas from `api/_crisper/scraps.js` and matching runs from
  `lab/runs.json`.
- `krispHelps: true` is only allowed on items in `scripts/krisp-tiers.mjs`
  and only for ethylene or ripening failures. The test suite enforces it.
- Run `npm run pages` after any edit and commit the output. It writes
  `produce/<slug>/index.html`, `produce/index.html`,
  `produce/what-went-wrong/index.html` (symptom checker, deep-linkable with
  `?item=broccoli&symptom=yellow`), `produce/pages.json` (used by `/seasonal`
  to link cards), `sitemap.xml` and `robots.txt`.
  `dev/produce-pages.test.mjs` fails if the committed files are stale.
- Every "Is it still OK?" line is a food-safety statement. Keep it
  conservative and in line with USDA FSIS mold guidance.

## CSA box guide (`/partners`)

CSAs and farm boxes paste this week's list and get a guide grouped by storage
spot (same zones as the Crisper Drawer Map), with copy-for-email (inline-styled
HTML), plain text and a print layout. It runs entirely in the browser; nothing
is sent or stored except saved boxes in the partner's own localStorage.

- `partners/engine.js` is a bundle of `api/_crisper/parser.js` and
  `storage.js`, so a CSA guide never disagrees with My Krisper. Run
  `npm run partner-engine` after changing the catalog or parser and commit it.
- Krisp notes come only from `krispReach` items, so the claims match
  `scripts/krisp-tiers.mjs`. Only drawer zones get the "Krisp goes here" tag.
- Each guide shows where and how to store. How long it lasts and what to do
  when it turns stay on the `/produce/<slug>` pages it links to.
- Links carry `utm_source=partner-guide&utm_medium=csa&utm_campaign=<partner>`.
  With a discount code the store link is `/discount/<code>?redirect=/products/double-krisp`.
- `?partner=Name&code=CODE` pre-fills the form for a link sent to one partner.
- Items the parser would misfile (garlic scapes, beet greens) are listed as
  "not in our guide yet" instead of guessed.

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
| `seasonal/produce.json` | 78 items. The source of truth for storage facts; `npm run sync` rebuilds the Storage Guide's data from it |
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
what to use first. Shelf-life ranges come from the Storage Guide (78 items,
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

Use-it-up features (the "eat it all" set):

- **Rescue 1 item today.** A card at the top of the dashboard picks the item
  closest to going bad (`pickRescue` in `api/_crisper/rescue.js`). Marking it
  used from the card counts as a rescue (`via: 'rescue_card'` on the event). It
  shows a daily rescue streak and the estimated value of this week's rescues
  (`rescueStats` in `impact.js`, always labeled "estimated").
- **Toss reasons.** After any toss (full or partial, item card, finish sheet or
  fridge check) a sheet asks why: Forgot about it, Spoiled early, Bought too
  much, Didn't like it, Skip. Stored on the finished row as
  `crisper_items.toss_reason` (`forgot | spoiled | too_much | disliked`, NULL when
  skipped or never asked). API: `{ id, op: 'reason', reason }`.
- **Fix per reason** (`fixFor`): Forgot offers to move similar items to Eat First
  and turn on use-soon reminders; Spoiled early shows that item's catalog storage
  tip plus "check your crisper is 34-37°F"; Bought too much feeds the Before you
  shop list; Didn't like it shows scrap ideas and recipe searches.
- **Before you shop** (`shopList`): what is still on hand ("You still have 2
  plums. Skip it?") and items to buy less of: tossed for "Bought too much", or
  50% or more tossed, in the last 2 purchases of that item. "Same as last trip"
  shows the same notes per row. The weekly shop email gets `buy_less_names`.
- **Rescue options** on due or overdue items: Cook now (recipe searches), Freeze
  it ([NCHFP blanching times](https://nchfp.uga.edu/how/freeze/freeze-general-information/blanching-times/);
  a per-item note only where the catalog scrap ideas already say to freeze it,
  otherwise generic; no freeze option for salad greens) and Ferment or pickle it
  (generic tip plus NCHFP links, only for veg that are commonly pickled).
- **Eat First zone.** Any item can be flagged Eat First (`crisper_items.eat_first`,
  `{ id, op: 'eatfirst', on }` or bulk `{ eatFirst: [ids], on }`). Flagged items
  sit in a highlighted zone at the top of the kitchen map and the list.
- **Crisper thermometer.** A dashboard prompt and a Settings row store a reading
  (`crisper_users.fridge_temp_f`, `fridge_temp_at`; `settings.fridgeTempF`,
  20-60). Guidance: 34-37°F good, above 40°F warns (the
  [FDA](https://www.fda.gov/consumers/consumer-updates/are-you-storing-food-safely)
  ceiling), below 32°F freezing risk. It asks again after 30 days.
- **Household comparison** on the Impact tab, once someone has logged 10 or more
  outcomes: their tossed share (by estimated weight) next to "US households lose
  about 24-25% of the fresh produce they buy", citing
  [USDA ERS Loss-Adjusted Food Availability](https://primary.ers.usda.gov/data-products/food-availability-per-capita-data-system/loss-adjusted-food-availability-documentation).

Copy rules: never say the app reduces waste; every dollar and CO₂ number says
"estimated".

Pilot mode (`api/_crisper/pilot.js`): each user has a `cohort` (NULL,
`baseline`, `full`, `holdout`) and `cohort_at`. Set it on `/krisper/admin` (the
Pilot cohort dropdown in Testers) or with
`POST /api/crisper/admin { key, email, cohort }` (`cohort: null` clears it).

| Cohort | Sees |
| --- | --- |
| NULL (default) | Everything |
| `baseline` | Logging only for 14 days after `cohort_at`, then everything |
| `full` | Everything |
| `holdout` | Logging only |

"Logging only" hides the rescue card, rescue options, fixes, Eat First, the
thermometer prompt, the comparison and the shopping nudges. The toss-reason
question itself shows for everyone so all groups are measured the same way.
Features that existed before the pilot are unchanged for every cohort. The
admin scorecard has a Pilot cohorts table (members, outcomes, tossed share by
count and by estimated weight, rescues, rescues from the card, reasons), split
by period, and a Toss reasons table.

Database changes: all additive, run by `ensureSchema` on first request
(`ADD COLUMN IF NOT EXISTS`), so old rows and old app builds keep working:
`crisper_items.toss_reason text`, `crisper_items.eat_first boolean NOT NULL DEFAULT false`,
`crisper_users.fridge_temp_f real`, `fridge_temp_at timestamptz`, `cohort text`,
`cohort_at timestamptz`.

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
