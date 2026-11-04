// Accounts, item state and receipt ingestion — shared by every endpoint.

import { createHmac, createHash, randomBytes } from 'node:crypto';
import { q, one, logEvent } from './db.js';
import { BY_NAME, itemView, sortViews, todayIn, toISODate, addDays, daysBetween, krispStatus } from './shelf.js';
import { trackEvent } from './klaviyo.js';

// ---------- secrets & links ----------

function secret() {
  const s = process.env.CRISPER_SECRET;
  if (s) return s;
  if (process.env.VERCEL_ENV === 'production') throw Object.assign(new Error('CRISPER_SECRET is not set'), { status: 500 });
  return 'dev-only-crisper-secret';
}

// The dashboard key is derived, not stored: HMAC(secret, user id). Only its hash
// is kept in the database, yet reminder emails can still carry a working link.
export function keyFor(userId) {
  return createHmac('sha256', secret()).update(`crisper-key:${userId}`).digest('base64url').slice(0, 32);
}
export function hashKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

export function siteOrigin() {
  return (process.env.CRISPER_PUBLIC_ORIGIN || 'https://guide.simplykrisp.com').replace(/\/$/, '');
}
export function dashboardUrl(userId) {
  return `${siteOrigin()}/crisper?k=${keyFor(userId)}&utm_source=crisper&utm_medium=email`;
}

// Personal forwarding address: plus-addressing on the Postmark inbound address,
// e.g. 4f1c…@inbound.postmarkapp.com -> 4f1c…+k7m2p9qx3a@inbound.postmarkapp.com
export function inboxAddress(slug) {
  const base = process.env.CRISPER_INBOUND_ADDRESS;
  if (!base || !base.includes('@')) return null;
  const [local, domain] = base.split('@');
  return `${local.split('+')[0]}+${slug}@${domain}`;
}

function newSlug() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

// ---------- users ----------

export function cleanEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 200 ? s : null;
}

export async function createUser({ email, firstName, tz, hasKrisp, krispChangedOn, marketingConsent, source }) {
  const existing = await one('SELECT id FROM crisper_users WHERE email = $1', [email]);
  if (existing) return { existing: true, user: existing };
  // id first so the key can be derived from it
  const idRow = await one('SELECT gen_random_uuid() AS id');
  const id = idRow.id;
  const key = keyFor(id);
  let user = null;
  for (let attempt = 0; attempt < 3 && !user; attempt++) {
    try {
      user = await one(
        `INSERT INTO crisper_users (id, email, first_name, key_hash, inbox_slug, tz, has_krisp, krisp_changed_on, marketing_consent, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [id, email, firstName || null, hashKey(key), newSlug(), validTz(tz), !!hasKrisp, krispChangedOn || null, !!marketingConsent, source || null],
      );
    } catch (e) {
      if (/inbox_slug/.test(e.message)) continue; // astronomically unlikely slug clash
      if (/email/.test(e.message) && /unique|duplicate/i.test(e.message)) return { existing: true };
      throw e;
    }
  }
  await logEvent(user.id, 'signup', { source: source || null, hasKrisp: !!hasKrisp });
  return { user, key };
}

function validTz(tz) {
  try {
    if (tz && typeof tz === 'string' && tz.length < 64) {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    }
  } catch {}
  return 'America/Denver';
}

export async function userFromKey(key) {
  if (!key || String(key).length < 20) return null;
  return one('SELECT * FROM crisper_users WHERE key_hash = $1', [hashKey(key)]);
}

export function keyFromReq(req) {
  return req.headers['x-crisper-key'] || (req.query && req.query.k) || (req.body && req.body.k) || null;
}

export async function requireUser(req) {
  const user = await userFromKey(keyFromReq(req));
  if (!user) throw Object.assign(new Error('That dashboard link is not valid. Use the link from your welcome email, or sign up again.'), { status: 401 });
  return user;
}

// ---------- state ----------

// Pending (ordered, not yet delivered) items go live the day after the order
// confirmation unless a final receipt replaces them first.
async function activateDuePending(user, today) {
  await q(`UPDATE crisper_items SET state = 'active', state_at = now() WHERE user_id = $1 AND state = 'pending' AND start_date <= $2`, [user.id, today]);
  await q(
    `UPDATE crisper_receipts r SET status = 'assumed'
       WHERE r.user_id = $1 AND r.status = 'pending'
         AND NOT EXISTS (SELECT 1 FROM crisper_items i WHERE i.receipt_id = r.id AND i.state = 'pending')`,
    [user.id],
  );
}

export async function buildState(user, { touch = true } = {}) {
  const today = todayIn(user.tz);
  await activateDuePending(user, today);
  if (touch) await q('UPDATE crisper_users SET last_seen_at = now() WHERE id = $1', [user.id]);

  const rows = await q(`SELECT * FROM crisper_items WHERE user_id = $1 AND state IN ('active','pending') ORDER BY created_at`, [user.id]);
  const active = sortViews(rows.filter((r) => r.state === 'active').map((r) => itemView(r, user, today)).filter(Boolean));
  const pending = rows.filter((r) => r.state === 'pending').map((r) => itemView(r, user, today)).filter(Boolean);

  const recentDone = await q(
    `SELECT id, produce, state, state_at, qty FROM crisper_items WHERE user_id = $1 AND state IN ('used','tossed') ORDER BY state_at DESC LIMIT 12`,
    [user.id],
  );
  const stats = await one(
    `SELECT
       count(*) FILTER (WHERE state = 'used'   AND state_at > now() - interval '30 days')::int AS used30,
       count(*) FILTER (WHERE state = 'tossed' AND state_at > now() - interval '30 days')::int AS tossed30,
       count(*) FILTER (WHERE created_at > now() - interval '30 days' AND state <> 'deleted')::int AS added30
     FROM crisper_items WHERE user_id = $1`,
    [user.id],
  );
  const receipts = await q(
    `SELECT id, received_at, channel, retailer, kind, order_ref, subject, status, item_count, matched, skipped, unknown
       FROM crisper_receipts WHERE user_id = $1 ORDER BY received_at DESC LIMIT 10`,
    [user.id],
  );

  return {
    today,
    user: {
      firstName: user.first_name,
      email: user.email,
      tz: user.tz,
      reminderPref: user.reminder_pref,
      marketingConsent: user.marketing_consent,
      createdAt: user.created_at,
    },
    inbox: {
      address: inboxAddress(user.inbox_slug),
      gmailVerification: user.gmail_verification || null,
      firstEmailAt: user.first_email_at,
    },
    krisp: krispStatus(user, today),
    items: active,
    pending,
    recentDone: recentDone.map((r) => ({ id: r.id, name: r.produce, state: r.state, at: r.state_at, qty: r.qty, imageUrl: BY_NAME[r.produce]?.imageUrl })),
    stats,
    receipts: receipts.map((r) => ({
      id: r.id,
      receivedAt: r.received_at,
      channel: r.channel,
      retailer: r.retailer,
      kind: r.kind,
      orderRef: r.order_ref,
      subject: r.subject,
      status: r.status,
      itemCount: r.item_count,
      matched: r.matched || [],
      skipped: r.skipped || [],
      unknown: r.unknown || [],
    })),
  };
}

// ---------- items ----------

export async function addItem(user, { produce, qty = 1, weight = null, date, source = 'manual', receiptId = null, state = 'active' }) {
  if (!BY_NAME[produce]) throw Object.assign(new Error(`Unknown produce: ${produce}`), { status: 400 });
  const today = todayIn(user.tz);
  let start = toISODate(date) || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || daysBetween(start, today) < -7 || daysBetween(start, today) > 120) start = today;
  const n = Math.max(1, Math.min(48, parseInt(qty, 10) || 1));
  return one(
    `INSERT INTO crisper_items (user_id, receipt_id, produce, qty, weight, source, start_date, state, state_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING *`,
    [user.id, receiptId, produce, n, weight ? String(weight).slice(0, 20) : null, source, start, state],
  );
}

export async function itemAction(user, { id, op, days, qty, date }) {
  const item = await one('SELECT * FROM crisper_items WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!item) throw Object.assign(new Error('Item not found'), { status: 404 });
  switch (op) {
    case 'used':
    case 'tossed':
      await q('UPDATE crisper_items SET state = $1, state_at = now() WHERE id = $2', [op, id]);
      break;
    case 'undo':
      await q(`UPDATE crisper_items SET state = 'active', state_at = now() WHERE id = $1`, [id]);
      break;
    case 'delete':
      await q(`UPDATE crisper_items SET state = 'deleted', state_at = now() WHERE id = $1`, [id]);
      break;
    case 'arrived':
      await q(`UPDATE crisper_items SET state = 'active', start_date = $1, state_at = now() WHERE id = $2`, [todayIn(user.tz), id]);
      break;
    case 'ripening': {
      const d = Math.max(-14, Math.min(14, parseInt(days, 10) || 2));
      await q('UPDATE crisper_items SET ripening_days = GREATEST(0, LEAST(21, ripening_days + $1)) WHERE id = $2', [d, id]);
      break;
    }
    case 'edit': {
      const n = Math.max(1, Math.min(48, parseInt(qty, 10) || item.qty));
      const d = toISODate(date) || toISODate(item.start_date);
      await q('UPDATE crisper_items SET qty = $1, start_date = $2 WHERE id = $3', [n, d, id]);
      break;
    }
    default:
      throw Object.assign(new Error(`Unknown action: ${op}`), { status: 400 });
  }
  await logEvent(user.id, `item_${op}`, { produce: item.produce, source: item.source });
}

// ---------- receipts ----------

// Store the parse result and turn it into items. Handles the confirmation ->
// final-receipt sequence so an order is never counted twice.
export async function applyOrder(user, parsed, channel) {
  const today = todayIn(user.tz);
  const kind = channel === 'email' ? parsed.kind : 'receipt';
  const items = parsed.items || [];
  const matched = items.map((i) => ({ name: i.name, count: i.count, weight: i.weight }));

  // Exact duplicate (same final receipt forwarded twice, or receipt + "delivered" email)
  if (parsed.orderRef && kind === 'receipt') {
    const dup = await one(
      `SELECT id FROM crisper_receipts WHERE user_id = $1 AND order_ref = $2 AND status = 'applied' AND received_at > now() - interval '21 days'`,
      [user.id, parsed.orderRef],
    );
    if (dup) {
      const r = await insertReceipt(user, parsed, channel, kind, 'duplicate', matched);
      return { receipt: r, added: 0, duplicate: true };
    }
  }
  if (parsed.orderRef && kind === 'confirmation') {
    const dup = await one(
      `SELECT id FROM crisper_receipts WHERE user_id = $1 AND order_ref = $2 AND status IN ('pending','assumed','applied') AND received_at > now() - interval '21 days'`,
      [user.id, parsed.orderRef],
    );
    if (dup) {
      const r = await insertReceipt(user, parsed, channel, kind, 'duplicate', matched);
      return { receipt: r, added: 0, duplicate: true };
    }
  }

  if (!items.length) {
    const r = await insertReceipt(user, parsed, channel, kind, 'no_produce', matched);
    await logEvent(user.id, 'receipt_no_produce', { channel, retailer: parsed.retailer });
    return { receipt: r, added: 0 };
  }

  let superseded = null;
  if (kind === 'receipt' && channel === 'email') {
    // Replace the matching confirmation: same order number, else the latest
    // pending/assumed order from the same retailer in the last week.
    superseded = parsed.orderRef
      ? await one(`SELECT id FROM crisper_receipts WHERE user_id = $1 AND order_ref = $2 AND status IN ('pending','assumed') ORDER BY received_at DESC LIMIT 1`, [user.id, parsed.orderRef])
      : null;
    if (!superseded && parsed.retailer && parsed.retailer !== 'Other') {
      superseded = await one(
        `SELECT id FROM crisper_receipts WHERE user_id = $1 AND retailer = $2 AND status IN ('pending','assumed') AND received_at > now() - interval '7 days' ORDER BY received_at DESC LIMIT 1`,
        [user.id, parsed.retailer],
      );
    }
    if (superseded) {
      // Only remove items the user hasn't already acted on.
      await q(`UPDATE crisper_items SET state = 'deleted', state_at = now() WHERE receipt_id = $1 AND state IN ('pending','active')`, [superseded.id]);
      await q(`UPDATE crisper_receipts SET status = 'superseded' WHERE id = $1`, [superseded.id]);
    }
  }

  const status = kind === 'confirmation' ? 'pending' : 'applied';
  const receipt = await insertReceipt(user, parsed, channel, kind, status, matched);
  const start = kind === 'confirmation' ? addDays(today, 1) : today;
  for (const it of items) {
    await addItem(user, {
      produce: it.name,
      qty: it.count,
      weight: it.weight,
      date: start,
      source: channel,
      receiptId: receipt.id,
      state: kind === 'confirmation' ? 'pending' : 'active',
    });
  }
  await logEvent(user.id, 'receipt_applied', { channel, retailer: parsed.retailer, kind, items: items.length, superseded: !!superseded });

  if (channel === 'email') {
    trackEvent({
      email: user.email,
      firstName: user.first_name,
      metric: 'Crisper Order Added',
      uniqueId: `order-${receipt.id}`,
      properties: {
        retailer: parsed.retailer,
        kind,
        item_count: items.length,
        item_names: listNames(items.map((i) => i.name)),
        dashboard_url: dashboardUrl(user.id),
      },
    });
  }
  return { receipt, added: items.length, superseded: !!superseded, pending: kind === 'confirmation' };
}

function insertReceipt(user, parsed, channel, kind, status, matched) {
  return one(
    `INSERT INTO crisper_receipts (user_id, channel, retailer, kind, order_ref, subject, status, item_count, matched, skipped, unknown)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb) RETURNING id, status`,
    [
      user.id,
      channel,
      parsed.retailer || null,
      kind,
      parsed.orderRef || null,
      parsed.subject || null,
      status,
      matched.length,
      JSON.stringify(matched),
      JSON.stringify((parsed.skipped || []).map((s) => ({ line: s.line.slice(0, 120), reason: s.reason, name: s.name }))),
      JSON.stringify((parsed.unknown || []).map((u) => u.slice(0, 120))),
    ],
  );
}

export function listNames(names) {
  const n = [...new Set(names)].map((s) => s.toLowerCase());
  if (n.length <= 1) return n.join('');
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}
