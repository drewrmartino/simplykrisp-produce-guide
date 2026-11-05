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

export default function handler(req, res) {
  const k = String((req.query && req.query.k) || new URL(req.url, 'http://x').searchParams.get('k') || '');
  const m = { ...BASE };
  if (/^[A-Za-z0-9_-]{20,64}$/.test(k)) m.start_url = `/krisper?source=app&k=${k}`;
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.statusCode = 200;
  res.end(JSON.stringify(m));
}
