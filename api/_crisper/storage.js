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
    out.push({
      name: c.name,
      image_url: c.imageUrl,
      where: WHERE[c.storage] || 'Fridge',
      how: c.tip || '',
      ripe_tip: c.ripensFirst ? (c.ripeTip || '') : '',
      keep_away_from: avoid.join(', '),
      lasts: c.minDays === c.maxDays ? `about ${c.minDays} days` : `${c.minDays}–${c.maxDays} days`,
      krisp: c.krispRecommended && extra[1] > 0 && c.storage !== 'counter' && c.storage !== 'pantry'
        ? (hasKrisp ? `Your Krisp adds about ${extra[0]}–${extra[1]} days` : `A Krisp adds about ${extra[0]}–${extra[1]} days`)
        : '',
      typically_wasted_pct: Math.round(w.rate * 100),
      typically_wasted_usd: w.usd.toFixed(2),
    });
  }
  // Shortest-lived first: that's what to put away carefully and eat first.
  out.sort((a, b) => (BY_NAME[a.name].maxDays - BY_NAME[b.name].maxDays) || a.name.localeCompare(b.name));
  return { guide_items: out.slice(0, 15), item_count: out.length, at_risk_usd: r2(usd).toFixed(2), at_risk_lb: r2(lb).toFixed(1) };
}
