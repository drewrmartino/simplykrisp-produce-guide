// POST /api/crisper/receipt { text, preview? } or { images: [dataURL], preview: true }
// Paste-a-receipt path: same parser as forwarded email. With preview: true it
// only returns what would be added, so the page can show it before saving.
// keep: [{ name, count }] is the reviewed list (wrong items removed, counts fixed).
// images: receipt photos, read by a vision model (see _crisper/vision.js). The
// photo is not stored; the page falls back to on-device reading on any error.

import { handle, bad } from '../_crisper/http.js';
import { requireUser, buildState, applyOrder } from '../_crisper/core.js';
import { parseEmail, extractItems } from '../_crisper/parser.js';
import { BY_NAME } from '../_crisper/shelf.js';
import { q, logEvent } from '../_crisper/db.js';
import { readReceiptImages, linesToText, gatewayToken, VISION_MODEL } from '../_crisper/vision.js';

const PHOTOS_PER_DAY = 20;

async function readPhotos(req, user) {
  const imgs = req.body.images.slice(0, 3).map(String);
  if (!imgs.length || imgs.some((u) => !/^data:image\/(jpeg|png|webp);base64,/.test(u))) throw bad('That file doesn\'t look like a photo.');
  if (imgs.reduce((n, u) => n + u.length, 0) > 4_000_000) throw bad('That photo is too large.', 413);
  const token = gatewayToken(req);
  if (!token) throw bad('Photo reading is not set up.', 503);
  const used = await q(`SELECT count(*)::int AS n FROM crisper_events WHERE user_id = $1 AND type = 'photo_read' AND at > now() - interval '1 day'`, [user.id]);
  if ((used[0]?.n || 0) >= PHOTOS_PER_DAY) throw bad('Daily photo limit reached.', 429);
  const t0 = Date.now();
  let read;
  try {
    read = await readReceiptImages(imgs, token);
  } catch (e) {
    console.error('photo read failed', e.message);
    await logEvent(user.id, 'photo_read', { ok: false, model: VISION_MODEL, ms: Date.now() - t0, err: String(e.message).slice(0, 120) });
    throw bad('Photo reading is unavailable right now.', 503);
  }
  await logEvent(user.id, 'photo_read', { ok: true, model: VISION_MODEL, ms: Date.now() - t0, photos: imgs.length, lines: read.lines.length });
  return read;
}

export default handle(['POST'], async (req) => {
  const user = await requireUser(req);
  let read = null;
  if (Array.isArray(req.body.images)) {
    read = await readPhotos(req, user);
    if (!read.lines.length) throw bad('Couldn\'t find receipt lines in that photo. Try again closer, flatter and in brighter light.');
    req.body.text = linesToText(read);
  }
  const text = String(req.body.text || '');
  if (text.trim().length < 3) throw bad('Paste the text of a receipt or order email.');
  if (text.length > 100000) throw bad('That is too long — paste just the item list.');
  const parsed = parseEmail({ text, subject: '', from: '' });
  if (parsed.type !== 'order') throw bad('That looks like a setup email, not a receipt.');
  if (read) {
    if (parsed.retailer === 'Other' && read.store) parsed.retailer = read.store;
    // The model also names the produce it recognised. Trust that only for lines
    // the parser neither matched nor deliberately skipped (e.g. "Rainier cherries").
    const have = new Set(parsed.items.map((i) => i.name));
    for (const l of read.lines) {
      if (!l.produce || have.has(l.produce)) continue;
      const one = extractItems(l.text);
      if (one.items.length || one.skipped.length) continue;
      parsed.items.push({ name: l.produce, count: l.qty, weight: null, lines: [l.text] });
      have.add(l.produce);
      parsed.unknown = parsed.unknown.filter((u) => u !== l.text);
    }
  }
  if (req.body.preview) return { preview: { retailer: parsed.retailer, items: parsed.items, skipped: parsed.skipped, unknown: parsed.unknown }, ...(read ? { text, ai: true } : {}) };
  if (Array.isArray(req.body.keep)) {
    const want = new Map();
    for (const k of req.body.keep.slice(0, 100)) {
      const name = String((k && k.name) || '');
      if (BY_NAME[name]) want.set(name, Math.max(1, Math.min(99, parseInt(k.count, 10) || 1)));
    }
    const out = [];
    for (const i of parsed.items) if (want.has(i.name)) { out.push({ ...i, count: want.get(i.name) }); want.delete(i.name); }
    for (const [name, count] of want) out.push({ name, count, weight: null });
    parsed.items = out;
  }
  const result = await applyOrder(user, parsed, req.body.channel === 'photo' ? 'photo' : 'paste');
  return { result: { added: result.added }, state: await buildState(user, { touch: false }) };
});
