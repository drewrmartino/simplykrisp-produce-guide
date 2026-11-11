// Small wrapper so every endpoint returns JSON errors the page can show.

// The iOS app (Capacitor) loads the page from capacitor://localhost and calls
// this API cross-origin. Auth is the X-Crisper-Key header, never cookies, so
// allowing these origins doesn't expose anything a browser session could.
const APP_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost']);

export function cors(req, res) {
  const origin = req.headers && req.headers.origin;
  if (!origin || !APP_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Crisper-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

export function handle(methods, fn) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    cors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      if (typeof req.body === 'string' && req.body) {
        try { req.body = JSON.parse(req.body); } catch { /* leave as text */ }
      }
      req.body = req.body || {};
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) res.status(status).json({ error: status >= 500 && !e.status ? 'Something went wrong. Try again in a moment.' : e.message });
    }
  };
}

export function bad(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
