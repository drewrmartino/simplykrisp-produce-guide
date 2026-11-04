// Small wrapper so every endpoint returns JSON errors the page can show.

export function handle(methods, fn) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
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
