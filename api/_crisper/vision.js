// Receipt photo -> clean item lines, using a vision model through Vercel AI Gateway.
//
// The model only transcribes and decodes the receipt ("BRCLI CRWN 2 @ 1.29" ->
// "Broccoli crowns, qty 2"). The result is turned back into plain text and run
// through the same rule-based parser as pasted receipts, so filtering (juice,
// frozen, refunded…) stays identical and the text stays editable on the page.
// The photo is sent once and never stored.

import { CATALOG } from './catalog.js';

const GATEWAY = process.env.CRISPER_GATEWAY_URL || 'https://ai-gateway.vercel.sh/v1/chat/completions';
export const VISION_MODEL = process.env.CRISPER_VISION_MODEL || 'google/gemini-2.5-flash';
const NAMES = CATALOG.map((c) => c.name);

export function gatewayToken(req) {
  return process.env.AI_GATEWAY_API_KEY || (req && req.headers && req.headers['x-vercel-oidc-token']) || process.env.VERCEL_OIDC_TOKEN || '';
}

const PROMPT = `You read photos of grocery receipts and grocery order screenshots.
Return JSON only: {"store": string|null, "lines": [{"text": string, "qty": number, "produce": string|null}]}

Rules:
- One entry per purchased item line, top to bottom. Skip totals, tax, payment, coupons, bag fees, loyalty points and store info.
- "text": the item written out in plain words, decoding register abbreviations (e.g. "BRCLI CRWN" -> "Broccoli crowns", "ORG BNNA" -> "Organic bananas", "STRWB 1LB" -> "Strawberries 1 lb", "GRN ONION" -> "Green onions"). Keep words like frozen, juice, dried, canned, sauce if they are part of the item.
- "qty": number of units bought (from "2 @", "QTY 3", "x2", or repeated lines). Use 1 for items sold by weight or when unclear.
- "produce": if the item is fresh, whole produce, the closest name from this list, else null: ${NAMES.join(', ')}.
- If an item was refunded, voided or out of stock, leave it out.
- If the image is not a receipt or order, return {"store": null, "lines": []}.`;

// images: array of data URLs (image/jpeg base64). Returns { store, lines } or throws.
export async function readReceiptImages(images, token, { fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(GATEWAY, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: images.length > 1 ? `These ${images.length} photos are parts of one receipt, in order.` : 'Read this receipt.' },
              ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw Object.assign(new Error(`gateway ${r.status}: ${body.slice(0, 200)}`), { gateway: r.status });
    }
    const j = await r.json();
    return parseModelJson(j?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(t);
  }
}

export function parseModelJson(content) {
  let s = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  let o;
  try { o = JSON.parse(s); } catch { throw new Error('model returned non-JSON'); }
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 150).map((l) => ({
    text: String((l && l.text) || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    qty: Math.max(1, Math.min(48, Math.round(Number(l && l.qty) || 1))),
    produce: NAMES.includes(l && l.produce) ? l.produce : null,
  })).filter((l) => l.text);
  return { store: o.store ? String(o.store).slice(0, 60) : null, lines };
}

// Plain text the parser (and the person, if they tap Back) can read.
export function linesToText({ store, lines }) {
  const out = [];
  if (store) out.push(`Store: ${store}`);
  for (const l of lines) out.push(l.qty > 1 ? `${l.qty} x ${l.text}` : l.text);
  return out.join('\n');
}
