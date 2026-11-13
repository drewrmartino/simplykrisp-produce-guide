// GET /api/crisper/manifest?k=KEY -> the app manifest with a personal start_url,
// so the installed app opens straight to this person's Krisper. Needed on iPhone,
// where a Home Screen app doesn't share Safari's saved sign-in.
// BASE must match /manifest.webmanifest (a test checks this).

export const BASE = {
  "id": "/krisper",
  "name": "Simply Krisp",
  "short_name": "Simply Krisp",
  "description": "Track the produce you buy, learn how to store it, and eat it before it goes bad.",
  "start_url": "/krisper?source=app",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#fcfbf5",
  "theme_color": "#2e431f",
  "categories": [
    "food",
    "lifestyle",
    "utilities"
  ],
  "icons": [
    {
      "src": "/icons/sk-home-180.png",
      "sizes": "180x180",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192.png?v=2",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png?v=2",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/maskable-512.png?v=2",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "My Krisper",
      "url": "/krisper?source=app",
      "icons": [
        {
          "src": "/icons/icon-192.png?v=2",
          "sizes": "192x192"
        }
      ]
    },
    {
      "name": "Produce Storage Guide",
      "url": "/",
      "icons": [
        {
          "src": "/icons/icon-192.png?v=2",
          "sizes": "192x192"
        }
      ]
    },
    {
      "name": "What's in season",
      "url": "/seasonal",
      "icons": [
        {
          "src": "/icons/icon-192.png?v=2",
          "sizes": "192x192"
        }
      ]
    }
  ]
};

// GET /.well-known/apple-app-site-association (rewritten here in vercel.json).
// Lets magic links like https://guide.simplykrisp.com/krisper?k=… open the iPhone
// app when it's installed. Uses the same Team ID env var as push notifications.
export function appSiteAssociation(env = process.env) {
  const team = env.APNS_TEAM_ID || env.APPLE_TEAM_ID || 'TEAMID';
  const appID = `${team}.${env.APNS_BUNDLE_ID || 'com.simplykrisp.krisper'}`;
  return {
    applinks: {
      details: [{
        appIDs: [appID],
        components: [
          { '/': '/krisper/admin*', exclude: true },
          { '/': '/krisper' },
          { '/': '/krisper/' },
          { '/': '/crisper' },
        ],
      }],
    },
    webcredentials: { apps: [appID] },
  };
}

export default function handler(req, res) {
  if ((req.query && req.query.aasa) || new URL(req.url, 'http://x').searchParams.get('aasa')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.statusCode = 200;
    return res.end(JSON.stringify(appSiteAssociation()));
  }
  const k = String((req.query && req.query.k) || new URL(req.url, 'http://x').searchParams.get('k') || '');
  const m = { ...BASE };
  if (/^[A-Za-z0-9_-]{20,64}$/.test(k)) m.start_url = `/krisper?source=app&k=${k}`;
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.statusCode = 200;
  res.end(JSON.stringify(m));
}
