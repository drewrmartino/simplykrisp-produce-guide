// Accounts, item state and receipt ingestion — shared by every endpoint.

import { createHmac, createHash, randomBytes } from 'node:crypto';
import { q, one, logEvent } from './db.js';
import { BY_NAME, itemView, sortViews, todayIn, toISODate, addDays, daysBetween, krispStatus } from './shelf.js';
import { storageGuide } from './storage.js';
import { trackEvent } from './klaviyo.js';
import { shopStatus } from './shop.js';
import { buildImpact } from './impact.js';
import { scrapFor, STOCK_BAG_TIP, TRIM_FATES } from './scraps.js';

// ---------- secrets & links ----------

export function secret() {
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
  // Preview builds link to their own stable branch URL, not production.
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  return (process.env.CRISPER_PUBLIC_ORIGIN || 'https://guide.simplykrisp.com').replace(/\/$/, '');
}
export function dashboardUrl(userId) {
  return `${siteOrigin()}/krisper?k=${keyFor(userId)}&utm_source=krisper&utm_medium=email`;
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

// ---------- Simply Krisp orders ----------

const SHOP_STALE_MS = 6 * 3600 * 1000;
const SHOP_MIN_MS = 60 * 1000;

// Refresh what we know from simplykrisp.com orders (via Klaviyo) when stale or
// asked. The first time we see a Double Krisp order we turn on "I have a Krisp"
// once; if the member later turns it off, we leave it off.
export async function refreshShop(user, { force = false } = {}) {
  const age = user.shop_checked_at ? Date.now() - new Date(user.shop_checked_at).getTime() : Infinity;
  if (age < SHOP_MIN_MS || (!force && age < SHOP_STALE_MS)) return user;
  const today = todayIn(user.tz);
  const fresh = await shopStatus(user.email, today);
  const prev = user.shop_status || {};
  if (!fresh.available) {
    // Keep the last good answer; just note the check so we don't hammer Klaviyo.
    return (await one('UPDATE crisper_users SET shop_checked_at = now() WHERE id = $1 RETURNING *', [user.id])) || user;
  }
  const status = { ...fresh, autoSet: !!prev.autoSet };
  const sets = ['shop_status = $2::jsonb', 'shop_checked_at = now()'];
  const vals = [user.id, null];
  if (fresh.doubleKrisp.owned && !user.has_krisp && !prev.autoSet) {
    status.autoSet = true;
    sets.push('has_krisp = true');
    if (!user.krisp_changed_on) {
      const lastShip = [fresh.refills.lastOrderedOn, fresh.doubleKrisp.lastOrderedOn].filter(Boolean).sort().pop();
      if (lastShip && daysBetween(lastShip, today) <= 35) { vals.push(lastShip); sets.push(`krisp_changed_on = $${vals.length}`); }
    }
    await logEvent(user.id, 'krisp_from_orders', { sub: fresh.subscription.status });
  }
  vals[1] = JSON.stringify(status);
  return (await one(`UPDATE crisper_users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals)) || user;
}

function shopView(user, krisp) {
  const s = user.shop_status;
  if (!s || !s.available) return { checked: false };
  const sub = s.subscription || {};
  const shipped = s.refills?.lastOrderedOn || null;
  return {
    checked: true,
    checkedAt: user.shop_checked_at,
    ownsDoubleKrisp: !!s.doubleKrisp?.owned,
    firstOrderedOn: s.doubleKrisp?.firstOrderedOn || null,
    subscription: { status: sub.status || 'none', nextOn: sub.nextOn || null, manageUrl: sub.manageUrl || null, every: sub.every || null },
    lastRefillOn: shipped,
    // A fresh pair shipped after the last time they marked a change.
    newPairWaiting: !!(shipped && krisp.owned && (!krisp.changedOn || shipped > krisp.changedOn) && daysBetween(shipped, todayIn(user.tz)) <= 30),
  };
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
    `SELECT id, produce, state, state_at, qty, tossed_frac, trim FROM crisper_items WHERE user_id = $1 AND state IN ('used','tossed') ORDER BY state_at DESC LIMIT 12`,
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
  const finished = await q(
    `SELECT produce, qty, weight, state, state_at, rescued, tossed_frac, trim FROM crisper_items WHERE user_id = $1 AND state IN ('used','tossed') AND state_at IS NOT NULL`,
    [user.id],
  );
  const krisp = krispStatus(user, today);
  const impact = buildImpact(finished, { today, tz: user.tz, krisp });
  const lastTrip = await lastTripFor(user);
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
      lastCheckAt: user.last_check_at || null,
      shopDay: user.shop_day || 'Fri',
    },
    lastTrip,
    inbox: {
      address: inboxAddress(user.inbox_slug),
      gmailVerification: user.gmail_verification || null,
      firstEmailAt: user.first_email_at,
    },
    krisp,
    shop: shopView(user, krisp),
    items: active,
    pending,
    recentDone: recentDone.map((r) => ({ id: r.id, name: r.produce, state: r.state, at: r.state_at, qty: r.qty, tossedFrac: Number(r.tossed_frac) || 0, trim: r.trim || null, scrap: scrapFor(r.produce), imageUrl: BY_NAME[r.produce]?.imageUrl })),
    stockBagTip: STOCK_BAG_TIP,
    stats,
    impact,
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

// The most recent shopping trip: everything added on the latest day that
// had additions (wrong items the user removed don't count). Merged by produce.
export async function lastTripFor(user) {
  const rows = await q(
    `SELECT produce, qty FROM crisper_items
      WHERE user_id = $1 AND state <> 'deleted'
        AND (created_at AT TIME ZONE $2)::date = (
          SELECT max((created_at AT TIME ZONE $2)::date) FROM crisper_items WHERE user_id = $1 AND state <> 'deleted')
      ORDER BY created_at`,
    [user.id, user.tz || 'America/Denver'],
  );
  const by = new Map();
  for (const r of rows) if (BY_NAME[r.produce]) by.set(r.produce, (by.get(r.produce) || 0) + (r.qty || 1));
  return [...by].map(([name, count]) => ({ name, count: Math.min(count, 48), imageUrl: BY_NAME[name].imageUrl }));
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

export async function itemAction(user, { id, op, days, qty, date, portion, trim }) {
  const item = await one('SELECT * FROM crisper_items WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!item) throw Object.assign(new Error('Item not found'), { status: 404 });
  switch (op) {
    case 'used':
    case 'tossed': {
      // A "rescue" = eaten in its last couple of days (or past the usual window).
      const v = op === 'used' ? itemView(item, user, todayIn(user.tz)) : null;
      const rescued = !!v && ['check', 'today', 'soon'].includes(v.status);
      await q('UPDATE crisper_items SET state = $1, state_at = now(), rescued = $2, tossed_frac = $3 WHERE id = $4', [op, rescued, op === 'tossed' ? 1 : 0, id]);
      break;
    }
    case 'finish': {
      // Eaten some, tossed some; optionally what happened to the trim. Works on
      // active items and on items already marked used/tossed (to fix or add trim).
      const p = [0, 0.25, 0.5, 0.75, 1].reduce((a, b) => (Math.abs(b - Number(portion)) < Math.abs(a - Number(portion)) ? b : a), 0);
      const t = TRIM_FATES.includes(trim) ? trim : null;
      const state = p >= 1 ? 'tossed' : 'used';
      let rescued = item.rescued;
      if (item.state === 'active') {
        const v = state === 'used' ? itemView(item, user, todayIn(user.tz)) : null;
        rescued = !!v && ['check', 'today', 'soon'].includes(v.status);
      }
      if (state === 'tossed') rescued = false;
      const keepAt = item.state === 'used' || item.state === 'tossed';
      await q(`UPDATE crisper_items SET state = $1, tossed_frac = $2, trim = $3, rescued = $4, state_at = ${keepAt ? 'COALESCE(state_at, now())' : 'now()'} WHERE id = $5`, [state, p, t, rescued, id]);
      break;
    }
    case 'trim': {
      if (item.state !== 'used' && item.state !== 'tossed') throw Object.assign(new Error('Finish the item first'), { status: 400 });
      await q('UPDATE crisper_items SET trim = $1 WHERE id = $2', [TRIM_FATES.includes(trim) ? trim : null, id]);
      break;
    }
    case 'undo':
      await q(`UPDATE crisper_items SET state = 'active', state_at = now(), rescued = false, tossed_frac = 0, trim = NULL WHERE id = $1`, [id]);
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
  await logEvent(user.id, `item_${op}`, { produce: item.produce, source: item.source, ...(op === 'finish' ? { portion: Number(portion) || 0, trim: trim || null } : op === 'trim' ? { trim: trim || null } : {}) });
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
      metric: 'Krisper Order Added',
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
  // Storage guide email (all receipt channels). Skip when this receipt just
  // replaced a confirmation: that order already got its guide.
  if (!superseded) {
    const guide = storageGuide(items, { hasKrisp: !!user.has_krisp });
    if (guide.guide_items.length) {
      await trackEvent({
        email: user.email,
        firstName: user.first_name,
        metric: 'Krisper Storage Guide',
        uniqueId: `guide-${receipt.id}`,
        properties: { zones: guide.zones, zone_count: guide.zones.length, item_count: guide.item_count, at_risk_usd: guide.at_risk_usd, at_risk_lb: guide.at_risk_lb, channel, retailer: parsed.retailer || null, item_names: guide.guide_items.length > 4 ? `these ${guide.item_count} items` : listNames(guide.guide_items.map((i) => i.name)), dashboard_url: dashboardUrl(user.id) },
      });
    }
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
