// TEMPORARY preview-only check of the Klaviyo read path. Removed before merge.
import { readKlaviyo, summarizeShop } from '../_crisper/shop.js';
export default async function handler(req, res) {
  const t = process.env.SHOPCHECK_TOKEN;
  if (process.env.VERCEL_ENV !== 'preview' || !t || req.headers['x-check'] !== t) { res.statusCode = 404; return res.end('not found'); }
  const out = {};
  for (const email of String(req.query.emails || '').split(',').filter(Boolean).slice(0, 3)) {
    try {
      const d = await readKlaviyo(email);
      out[email] = d ? { orders: d.orders.length, lifecycle: d.lifecycle.length, kinds: [...new Set(d.lifecycle.map((e) => e.kind))], summary: summarizeShop(d, new Date().toISOString().slice(0, 10)) } : 'no key';
    } catch (e) { out[email] = { error: e.message, status: e.status }; }
  }
  res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
}
