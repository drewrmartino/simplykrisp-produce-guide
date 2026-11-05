// Shelf-life math. Everything is a RANGE from the Storage Guide, never a single
// "expires on" date: produce varies with ripeness at purchase and fridge temp,
// and a confident wrong countdown costs more trust than a range does.

import { CATALOG } from './catalog.js';
import { typicalWaste } from './impact.js';
import { scrapFor } from './scraps.js';

export const BY_NAME = Object.fromEntries(CATALOG.map((c) => [c.name, c]));

// Where it goes in the kitchen (same zones as the Crisper Drawer Map).
const SHELF = new Set(['Blueberry', 'Strawberry', 'Raspberry', 'Blackberry', 'Cranberry', 'Herbs (Fresh)', 'Mushroom']);
export function zoneFor(c) {
  if (c.storage === 'pantry') return 'pantry';
  if (c.storage === 'counter' || c.storage === 'counter_then_fridge') return 'counter';
  if (SHELF.has(c.name)) return 'shelf';
  return c.category === 'fruit' ? 'low' : 'high';
}

// A sachet is good for about 30 days; after ~35 we stop crediting it.
export const KRISP_LIFE_DAYS = 30;
const KRISP_GRACE_DAYS = 5;

export function todayIn(tz = 'America/Denver') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function toISODate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  // pg/neon may return Date objects at UTC midnight for `date` columns
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}

export function addDays(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

export function krispStatus(user, today) {
  if (!user.has_krisp) return { active: false, owned: false };
  const changed = toISODate(user.krisp_changed_on);
  if (!changed) return { active: true, owned: true, changedOn: null, ageDays: null, dueInDays: null };
  const age = daysBetween(changed, today);
  return {
    owned: true,
    changedOn: changed,
    ageDays: age,
    dueInDays: KRISP_LIFE_DAYS - age,
    active: age <= KRISP_LIFE_DAYS + KRISP_GRACE_DAYS,
  };
}

// Krisp only gets credit where the guide shows a measured/estimated benefit and
// the item actually lives in the fridge, where the sachet is.
function krispApplies(c, krisp) {
  return krisp.active && c.krispRecommended && (c.storage === 'refrigerator' || c.storage === 'counter_then_fridge');
}

export function itemView(row, user, today) {
  const c = BY_NAME[row.produce];
  if (!c) return null;
  const krisp = krispStatus(user, today);
  const start = addDays(toISODate(row.start_date), row.ripening_days || 0);
  const age = Math.max(0, daysBetween(start, today));
  const boost = krispApplies(c, krisp) ? c.krispExtra : [0, 0];
  const min = c.minDays + boost[0];
  const max = c.maxDays + boost[1];
  const leftMin = min - age;
  const leftMax = max - age;

  let status;
  let label;
  if (leftMax < 0) {
    status = 'check';
    label = 'Past its usual window — check it';
  } else if (leftMin <= 0) {
    status = 'today';
    label = leftMax === 0 ? 'Use today' : `Use now · up to ${leftMax} more day${leftMax === 1 ? '' : 's'}`;
  } else {
    status = leftMin <= 2 ? 'soon' : leftMin <= 6 ? 'week' : 'later';
    label = leftMin === leftMax ? `About ${leftMin} day${leftMin === 1 ? '' : 's'} left` : `${leftMin}–${leftMax} days left`;
  }

  return {
    id: row.id,
    name: c.name,
    imageUrl: c.imageUrl,
    category: c.category,
    storage: c.storage,
    zone: zoneFor(c),
    qty: row.qty,
    weight: row.weight,
    source: row.source,
    state: row.state,
    startDate: start,
    boughtDate: toISODate(row.start_date),
    ripeningDays: row.ripening_days || 0,
    ripensFirst: c.ripensFirst,
    ageDays: age,
    minDays: min,
    maxDays: max,
    leftMin,
    leftMax,
    status,
    label,
    progress: Math.max(0, Math.min(1, age / Math.max(1, max))),
    krispBoost: boost[1] > 0 ? boost : null,
    krispCould: !boost[1] && c.krispRecommended && c.storage !== 'counter' && c.storage !== 'pantry' ? c.krispExtra : null,
    tip: c.tip,
    ripeTip: c.ripeTip,
    scrap: scrapFor(c.name),
    avoidWith: c.avoidWith || [],
    ethyleneProduction: c.ethyleneProduction,
    ethyleneSensitivity: c.ethyleneSensitivity,
    krispRecommended: !!c.krispRecommended,
    waste: typicalWaste(row),
  };
}

export const STATUS_ORDER = { check: 0, today: 1, soon: 2, week: 3, later: 4 };

export function sortViews(views) {
  return views.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.leftMin - b.leftMin || a.leftMax - b.leftMax || a.name.localeCompare(b.name));
}
