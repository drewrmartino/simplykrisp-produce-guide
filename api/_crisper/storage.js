// Property is guide_items (not items) so Klaviyo templates never collide with dict.items.
// "How to store what you just bought": the per-order storage guide that rides
// on the Krisper Storage Guide Klaviyo event, so a flow can email it right
// after a receipt is read (forwarded email, pasted text or receipt photo).

import { BY_NAME } from './shelf.js';
import { typicalWaste } from './impact.js';

export const WHERE = {
  refrigerator: 'Fridge',
  counter: 'Counter',
  counter_then_fridge: 'Counter until ripe, then fridge',
  pantry: 'Cool, dark pantry',
};

// Where it goes, laid out like the Crisper Drawer Map (/lab/crisper-map).
export const ZONES = [
  { key: 'high', title: 'Crisper drawer: high humidity', detail: 'Vent closed. Things that wilt go here.', drawer: true },
  { key: 'low', title: 'Crisper drawer: low humidity', detail: 'Vent open. Fruit, including the ethylene producers, kept away from your greens.', drawer: true },
  { key: 'shelf', title: 'Fridge shelf', detail: 'In the main fridge, not a drawer.' },
  { key: 'counter', title: 'Counter', detail: 'Room temperature, out of direct sun.' },
  { key: 'pantry', title: 'Cool, dark cupboard', detail: 'Not the fridge. Keep onions away from potatoes.' },
];
const SHELF = new Set(['Blueberry', 'Strawberry', 'Raspberry', 'Blackberry', 'Cranberry', 'Herbs (Fresh)', 'Mushroom']);
const SHELF_HOW = { 'Herbs (Fresh)': 'Top shelf, stems in a jar of water with a loose bag over the top.', Mushroom: 'Paper bag on a shelf.' };

export function zoneFor(c) {
  if (c.storage === 'pantry') return 'pantry';
  if (c.storage === 'counter' || c.storage === 'counter_then_fridge') return 'counter';
  if (SHELF.has(c.name)) return 'shelf';
  return c.category === 'fruit' ? 'low' : 'high';
}
const MELON = /melon|cantaloupe|honeydew/i;
function thenNote(c) {
  if (c.storage !== 'counter_then_fridge' || /refrigerat|fridge/i.test(c.tip || '')) return '';
  return MELON.test(c.name) ? 'Once cut: wrap it and move it to the fridge.' : 'Once ripe: move it to the low-humidity drawer for a few more days.';
}

const r2 = (n) => Math.round(n * 100) / 100;
const stem = (s) => String(s).toLowerCase().replace(/(oes|ies|es|s)$/, (m) => (m === 'ies' ? 'y' : m === 'oes' ? 'o' : ''));

// items: [{ name, count, weight }] as returned by the parser.
export function storageGuide(items, { hasKrisp = false } = {}) {
  const seen = new Set();
  const names = new Set(items.map((i) => stem(i.name)));
  const out = [];
  let usd = 0, lb = 0;
  for (const it of items) {
    const c = BY_NAME[it.name];
    if (!c || seen.has(c.name)) continue;
    seen.add(c.name);
    const w = typicalWaste({ produce: c.name, qty: it.count || 1, weight: it.weight || null });
    usd += w.usd; lb += w.lb;
    // Put the conflicts that are actually in this order first.
    const avoid = [...(c.avoidWith || [])].sort((a, b) => (names.has(stem(b)) ? 1 : 0) - (names.has(stem(a)) ? 1 : 0)).slice(0, 3);
    const extra = c.krispExtra || [0, 0];
    const zone = zoneFor(c);
    out.push({
      name: c.name,
      zone,
      then: thenNote(c),
      shelf_how: SHELF_HOW[c.name] || (zone === 'shelf' ? 'Middle shelf, in the vented container it came in.' : ''),
      image_url: c.imageUrl,
      where: WHERE[c.storage] || 'Fridge',
      how: c.tip || '',
      ripe_tip: c.ripensFirst ? (c.ripeTip || '') : '',
      keep_away_from: avoid.join(', '),
      lasts: c.minDays === c.maxDays ? `about ${c.minDays} days` : `${c.minDays}–${c.maxDays} days`,
      // Krisp sits in the crisper drawers, so only promise days for drawer items.
      krisp: c.krispRecommended && extra[1] > 0 && (zone === 'high' || zone === 'low')
        ? (hasKrisp ? `Your Krisp adds about ${extra[0]}–${extra[1]} days` : `A Krisp adds about ${extra[0]}–${extra[1]} days`)
        : '',
      typically_wasted_pct: Math.round(w.rate * 100),
      typically_wasted_usd: w.usd.toFixed(2),
    });
  }
  // Shortest-lived first: that's what to put away carefully and eat first.
  out.sort((a, b) => (BY_NAME[a.name].maxDays - BY_NAME[b.name].maxDays) || a.name.localeCompare(b.name));
  const list = out.slice(0, 15);
  // Grouped like the fridge map, shortest-lived first within each spot.
  // zone_items (not items) so Klaviyo never collides with dict.items.
  const zones = ZONES.map((z) => ({
    key: z.key, title: z.title, detail: z.detail,
    krisp_note: z.drawer ? (hasKrisp ? 'Your Krisp goes here' : 'A Krisp goes here') : '',
    names: '',
    zone_items: list.filter((i) => i.zone === z.key),
  })).filter((z) => z.zone_items.length);
  for (const z of zones) z.names = z.zone_items.map((i) => i.name).join(', ');
  return { guide_items: list, zones, item_count: out.length, at_risk_usd: r2(usd).toFixed(2), at_risk_lb: r2(lb).toFixed(1) };
}
