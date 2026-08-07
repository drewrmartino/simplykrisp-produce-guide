// Vercel serverless function — proxies the USDA Local Food Portal directory.
// The USDA endpoint is public and unauthenticated but rejects requests without
// browser-like headers, and it sends no CORS headers, so it must be proxied.
//
// Mirror of server.py, which is the local dev equivalent. Keep the two in sync;
// the radius parsing in particular is deliberately identical.

const BASE = 'https://www.usdalocalfoodportal.com/api/get_searchresult_list/';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Referer: 'https://www.usdalocalfoodportal.com/fe/fdirectory_farmersmarket/',
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json, text/javascript, */*; q=0.01',
};

// USDA can take 8s+ for remote ZIPs. Vercel kills the whole function at 10s, so
// cap each directory below that: a slow one returns empty instead of 504-ing the
// entire response and blanking the rail.
const DIRECTORY_TIMEOUT_MS = 7000;

async function fetchDirectory(directory, zip, radius) {
  const qs = new URLSearchParams({
    'mydata[directory]': directory,
    'mydata[location]': zip,
    'mydata[radius]': String(radius),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DIRECTORY_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}?${qs}`, { headers: HEADERS, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return [];
  const payload = await res.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map((r) => ({
      id: r.listing_id,
      type: directory,
      name: r.listing_name,
      address: r.location_address,
      city: r.location_city,
      state: r.location_state,
      website: r.media_website,
      facebook: r.media_facebook,
      phone: r.contact_phone,
      distance: r.distance ? Math.round(parseFloat(r.distance) * 10) / 10 : null,
      // location_x is longitude, location_y is latitude
      lng: Number.isFinite(parseFloat(r.location_x)) ? parseFloat(r.location_x) : null,
      lat: Number.isFinite(parseFloat(r.location_y)) ? parseFloat(r.location_y) : null,
      url: `https://www.usdalocalfoodportal.com/fe/flisting/?lid=${r.listing_id}&directory_type=${directory}`,
    }))
    .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999))
    .slice(0, 12);
}

export default async function handler(req, res) {
  const zip = String(req.query.zip || '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) {
    return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });
  }
  // Match server.py's int()-or-default behaviour exactly. `parseInt(x) || 40`
  // does not: it treats a valid 0 as falsy, and it truncates '1e9' to 1 instead
  // of rejecting it. Require a plain integer literal, else fall back to 40.
  const rawRadius = String(req.query.radius == null ? '' : req.query.radius).trim();
  const radius = /^[+-]?\d+$/.test(rawRadius)
    ? Math.max(5, Math.min(parseInt(rawRadius, 10), 100))
    : 40;

  const directories = ['farmersmarket', 'csa', 'onfarmmarket', 'foodhub'];
  const settled = await Promise.allSettled(
    directories.map((d) => fetchDirectory(d, zip, radius))
  );

  const out = { zip, radius };
  directories.forEach((d, i) => {
    out[d] = settled[i].status === 'fulfilled' ? settled[i].value : [];
  });

  // Cache at the edge — this data changes rarely.
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(out);
}
