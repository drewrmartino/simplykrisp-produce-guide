// What a member has bought from simplykrisp.com: do they own a Double Krisp, and
// is their refill subscription active? Read from Klaviyo, where Shopify orders
// ("Ordered Product") and Appstle subscription events already land. Read-only.
//
// If Klaviyo is unreachable or the key lacks read access, everything returns
// { available: false } and the app falls back to "I have a Krisp" in Settings.

const API = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

export const DOUBLE_KRISP_ID = '10023847821631';
export const REFILL_ID = '10042515259711';
const DEFAULT_MANAGE_URL = 'https://simplykrisp.com/account';

// Klaviyo metric name -> how it moves a subscription.
const LIFECYCLE = {
  'Create Subscription Event from Appstle': 'active',
  'Upcoming Order Event from Appstle': 'active',
  'Subscription resumed': 'active',
  'Subscription paused': 'paused',
  'Subscription canceled': 'cancelled',
  '$hub.subscription.state': 'hub',
};
const ORDERED = 'Ordered Product';

// ---------- pure summary (tested) ----------

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

function addInterval(iso, unit, count) {
  const d = new Date(`${iso}T12:00:00Z`);
  const n = Math.max(1, count || 1);
  const u = String(unit || 'MONTH').toUpperCase();
  if (u.startsWith('DAY')) d.setUTCDate(d.getUTCDate() + n);
  else if (u.startsWith('WEEK')) d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (u.startsWith('YEAR')) d.setUTCFullYear(d.getUTCFullYear() + n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

const daysAgo = (iso, today) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day(iso)}T00:00:00Z`)) / 86400000);

/**
 * orders:    [{ at, productId, name }]
 * lifecycle: [{ at, kind: 'active'|'paused'|'cancelled', contract, nextOn, manageUrl, unit, count, product }]
 */
export function summarizeShop({ orders = [], lifecycle = [] }, today) {
  const isDK = (o) => String(o.productId) === DOUBLE_KRISP_ID || /double krisp/i.test(o.name || '') && !/refill|subscription/i.test(o.name || '');
  const isRefill = (o) => String(o.productId) === REFILL_ID || /refill|subscription/i.test(o.name || '');
  const dk = orders.filter(isDK).sort((a, b) => a.at.localeCompare(b.at));
  const rf = orders.filter(isRefill).sort((a, b) => a.at.localeCompare(b.at));
  const all = [...orders].sort((a, b) => a.at.localeCompare(b.at));

  // Latest event per contract wins.
  const byContract = new Map();
  for (const e of [...lifecycle].sort((a, b) => a.at.localeCompare(b.at))) {
    const k = e.contract || 'unknown';
    const prev = byContract.get(k) || {};
    byContract.set(k, { ...prev, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== '')) });
  }
  const contracts = [...byContract.values()];
  const lastRefill = rf.length ? rf[rf.length - 1] : null;
  // Recent subscription orders keep "active" honest when lifecycle events are sparse.
  const recentlyBilled = lastRefill && daysAgo(lastRefill.at, today) <= 45;

  let status = 'none';
  let pick = null;
  const actives = contracts.filter((c) => c.kind === 'active' && (daysAgo(c.at, today) <= 70 || recentlyBilled));
  if (actives.length) {
    status = 'active';
    pick = actives.sort((a, b) => b.at.localeCompare(a.at))[0];
  } else if (contracts.some((c) => c.kind === 'paused')) {
    status = 'paused';
    pick = contracts.filter((c) => c.kind === 'paused').sort((a, b) => b.at.localeCompare(a.at))[0];
  } else if (contracts.some((c) => c.kind === 'cancelled')) {
    status = 'cancelled';
    pick = contracts.filter((c) => c.kind === 'cancelled').sort((a, b) => b.at.localeCompare(a.at))[0];
  } else if (contracts.some((c) => c.kind === 'active')) {
    status = 'unknown'; // had one, no recent sign of life
    pick = contracts.sort((a, b) => b.at.localeCompare(a.at))[0];
  } else if (recentlyBilled) {
    status = 'active';
  }

  let nextOn = null;
  if (status === 'active') {
    const unit = pick?.unit || 'MONTH';
    const count = pick?.count || 1;
    let n = day(pick?.nextOn) || (lastRefill ? addInterval(day(lastRefill.at), unit, count) : null);
    for (let i = 0; n && n < today && i < 24; i++) n = addInterval(n, unit, count);
    nextOn = n;
  }

  return {
    available: true,
    found: orders.length > 0 || lifecycle.length > 0,
    doubleKrisp: {
      owned: dk.length > 0 || rf.length > 0,
      firstOrderedOn: day((dk[0] || rf[0])?.at),
      lastOrderedOn: day(dk[dk.length - 1]?.at),
    },
    refills: { lastOrderedOn: day(lastRefill?.at), count: rf.length },
    subscription: {
      status,
      nextOn,
      manageUrl: (status === 'active' || status === 'paused') ? (pick?.manageUrl || DEFAULT_MANAGE_URL) : null,
      every: status === 'active' && pick?.unit ? `${pick.count > 1 ? `${pick.count} ` : ''}${String(pick.unit).toLowerCase()}${pick.count > 1 ? 's' : ''}` : null,
    },
    lastOrderOn: day(all[all.length - 1]?.at),
  };
}

// ---------- Klaviyo reader ----------

async function get(path, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
      headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: REVISION, accept: 'application/vnd.api+json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`klaviyo ${res.status}`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

let metricCache = null;
async function metricIds(key) {
  if (metricCache) return metricCache;
  const wanted = new Set([ORDERED, ...Object.keys(LIFECYCLE)]);
  const ids = {};
  let url = '/metrics?fields[metric]=name';
  for (let i = 0; url && i < 6; i++) {
    const r = await get(url, key);
    for (const m of r.data || []) if (wanted.has(m.attributes?.name)) ids[m.attributes.name] = m.id;
    url = r.links?.next || null;
  }
  metricCache = ids;
  return ids;
}

async function events(profileId, metricId, key) {
  const filter = encodeURIComponent(`and(equals(profile_id,"${profileId}"),equals(metric_id,"${metricId}"))`);
  const r = await get(`/events?filter=${filter}&sort=-datetime&fields[event]=datetime,event_properties`, key);
  return (r.data || []).slice(0, 60).map((e) => ({ at: e.attributes.datetime, p: e.attributes.event_properties || {} }));
}

const first = (...v) => v.find((x) => x != null && x !== '');

function lifecycleFrom(metric, list) {
  const kind = LIFECYCLE[metric];
  return list.map(({ at, p }) => {
    let k = kind;
    if (kind === 'hub') {
      const s = String(p.status || '').toLowerCase();
      k = s === 'active' ? 'active' : s === 'paused' ? 'paused' : s ? 'cancelled' : null;
    }
    return {
      at,
      kind: k,
      contract: String(first(p.subscriptionContractId, p.external_id, p.contractId, '') || '') || null,
      nextOn: day(first(p.nextOrderDateISO, p.next_billing_date, p.nextBillingDate)),
      manageUrl: first(p.manageSubscriptionLink, p.manage_url) || null,
      unit: first(p.deliveryInterval, p.billing_interval?.interval, p.billingInterval) || null,
      count: Number(first(p.deliveryIntervalCount, p.billing_interval?.interval_count, 1)) || 1,
    };
  }).filter((e) => e.kind);
}

let reader = null; // tests swap this out
export function setShopReader(fn) { reader = fn; }

export async function readKlaviyo(email) {
  const key = process.env.KLAVIYO_PRIVATE_KEY;
  if (!key) return null;
  const prof = await get(`/profiles?filter=${encodeURIComponent(`equals(email,"${email.replace(/"/g, '')}")`)}&fields[profile]=email`, key);
  const pid = prof.data?.[0]?.id;
  if (!pid) return { orders: [], lifecycle: [] };
  const ids = await metricIds(key);
  const jobs = Object.entries(ids).map(async ([name, id]) => [name, await events(pid, id, key)]);
  const out = { orders: [], lifecycle: [] };
  for (const [name, list] of await Promise.all(jobs)) {
    if (name === ORDERED) out.orders.push(...list.map(({ at, p }) => ({ at, productId: String(first(p.ProductID, p.product_id, '') || ''), name: first(p.Name, p.ProductName, '') })));
    else out.lifecycle.push(...lifecycleFrom(name, list));
  }
  return out;
}

export async function shopStatus(email, today) {
  try {
    const data = reader ? await reader(email) : await readKlaviyo(email);
    if (!data) return { available: false };
    return summarizeShop(data, today);
  } catch (e) {
    console.error('shop status failed', e.status || '', e.message);
    return { available: false };
  }
}
