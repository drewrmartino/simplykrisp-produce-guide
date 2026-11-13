// Applies the Krisp tiers in scripts/krisp-tiers.mjs to /seasonal/produce.json,
// then rebuilds the Storage Guide bundle's produce data (an embedded
// JSON.parse(`...`) literal) from produce.json, so every page lists the same
// items with the same storage facts and Krisp claims.
//   npm run sync   (node scripts/apply-krisp-tiers.mjs)
// Idempotent. To add an item: add it to seasonal/produce.json, data/spoilage.json
// and the tables this script and `npm run catalog` ask for, then run
// `npm run sync && npm run catalog && npm run pages`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KRISP, NO_KRISP, benefitText } from './krisp-tiers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- /seasonal/produce.json ----------
const prodPath = path.join(root, 'seasonal/produce.json');
const produce = JSON.parse(readFileSync(prodPath, 'utf8'));
const RANGE = {};
for (const p of produce) {
  if (KRISP[p.name] && p.extraDays > 0) {
    const range = p.extraDaysRange || String(p.extraDays);
    RANGE[p.name] = range;
    p.krispRecommended = true;
    p.krispBenefit = benefitText(p.name, range, p.storageLocation);
    delete p.noBenefitReason;
  } else {
    p.krispRecommended = false;
    p.extraDays = 0;
    delete p.extraDaysRange;
    p.krispBenefit = '';
    p.noBenefitReason = NO_KRISP[p.name] || p.noBenefitReason || '';
  }
}
writeFileSync(prodPath, JSON.stringify(produce, null, 2) + '\n');

// ---------- Storage Guide bundle ----------
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const bundleRel = html.match(/src="\.?\/?(assets\/index-[^"]+\.js)"/)[1];
const bundlePath = path.join(root, bundleRel);
let js = readFileSync(bundlePath, 'utf8');

const OPEN = 'JSON.parse(`[{"id":1,';
const start = js.indexOf(OPEN);
if (start < 0) throw new Error('produce data literal not found');
const litStart = start + 'JSON.parse(`'.length;
let litEnd = litStart;
while (true) { // find the closing unescaped backtick
  litEnd = js.indexOf('`', litEnd);
  let bs = 0; for (let k = litEnd - 1; js[k] === '\\'; k--) bs++;
  if (bs % 2 === 0) break;
  litEnd++;
}
const literal = js.slice(litStart, litEnd);
if (literal.includes('${')) throw new Error('unexpected template expression');
const unescape = (t) => new Function('return `' + t + '`')();
const escape = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const data = JSON.parse(unescape(literal));
if (escape(JSON.stringify(data)) !== literal) throw new Error('round-trip mismatch; refusing to rewrite the bundle');

// Every record is rebuilt from produce.json, so the Storage Guide can't drift
// from /seasonal, /produce and My Krisper. Only the id and the price fields
// (used by the waste estimate) live in the bundle; new items get theirs below.
// [avgPrice, priceUnit, typicalQty, qtyUnit, weightLbs, totalPrice]. avgPrice is
// per one of qtyUnit. Rough 2026 U.S. supermarket prices.
const PRICE = {
  Mandarin: [1.6, 'lb', 3, 'lbs', 3, 4.8],
  Cilantro: [1, 'bunch', 1, 'bunch', 0.2, 1],
  Parsley: [1.25, 'bunch', 1, 'bunch', 0.2, 1.25],
  Basil: [2.5, 'bunch', 1, 'bunch', 0.1, 2.5],
  'Bagged Salad': [3.5, 'bag', 1, 'bag (8oz)', 0.5, 3.5],
  'Bok Choy': [2, 'lb', 1, 'lb', 1, 2],
  'Collard Greens': [2.5, 'bunch', 1, 'bunch', 1, 2.5],
  'Swiss Chard': [2.25, 'bunch', 1, 'bunch', 0.6, 2.25],
  Arugula: [3, 'bag', 1, 'bag (5oz)', 0.3, 3],
  'Mustard Greens': [3, 'bunch', 1, 'bunch', 1, 3],
  Beet: [2, 'lb', 1, 'lb', 1, 2],
  Ginger: [4.5, 'lb', 0.5, 'lb', 0.5, 2.25],
  Leek: [3, 'lb', 1, 'lb', 1, 3],
  Artichoke: [2, 'each', 2, 'artichokes', 1.5, 4],
  Pumpkin: [4, 'each', 1, 'pumpkin', 5, 4],
  Okra: [5.5, 'lb', 0.5, 'lb', 0.5, 2.75],
  Plantain: [0.6, 'each', 3, 'plantains', 1.5, 1.8],
  Tomatillo: [2.2, 'lb', 1, 'lb', 1, 2.2],
  Persimmon: [1.25, 'each', 3, 'persimmons', 1.2, 3.75],
  Parsnip: [2.5, 'lb', 1, 'lb', 1, 2.5],
  Turnip: [1.5, 'lb', 1, 'lb', 1, 1.5],
  Fennel: [3, 'bulb', 1, 'bulb', 1, 3],
};
const PRICE_KEYS = ['avgPrice', 'priceUnit', 'typicalQty', 'qtyUnit', 'weightLbs', 'totalPrice'];
const old = Object.fromEntries(data.map((d) => [d.name, d]));
let nextId = Math.max(...data.map((d) => d.id)) + 1;
const rebuilt = produce.map((p) => {
  const o = old[p.name];
  const price = o ? PRICE_KEYS.map((k) => o[k]) : PRICE[p.name];
  if (!price) throw new Error(`${p.name}: add price fields to PRICE in scripts/apply-krisp-tiers.mjs`);
  const [avgPrice, priceUnit, typicalQty, qtyUnit, weightLbs, totalPrice] = price;
  return {
    id: o ? o.id : nextId++,
    name: p.name,
    category: p.category,
    emoji: p.emoji,
    storageLocation: p.storageLocation,
    ethyleneProduction: p.ethyleneProduction,
    ethyleneSensitivity: p.ethyleneSensitivity,
    optimalTempF: p.optimalTempF,
    shelfLife: p.shelfLife,
    storageTips: JSON.stringify(p.storageTips),
    krispRecommended: p.krispRecommended,
    // When there's no benefit this holds the reason, shown as "Why a Krisp won't help much here".
    krispBenefit: p.krispRecommended ? p.krispBenefit : p.noBenefitReason || '',
    ripeTip: p.ripeTip,
    avoidWith: p.avoidWith ? JSON.stringify(p.avoidWith) : null,
    extraDays: p.extraDays,
    avgPrice, priceUnit,
    imageUrl: p.imageUrl,
    typicalQty, qtyUnit, weightLbs, totalPrice,
  };
});
const gone = data.filter((d) => !produce.some((p) => p.name === d.name)).map((d) => d.name);
if (gone.length) throw new Error(`in the bundle but not in produce.json: ${gone.join(', ')}`);
rebuilt.sort((a, b) => a.id - b.id);
js = js.slice(0, litStart) + escape(JSON.stringify(rebuilt)) + js.slice(litEnd);

// Detail page: show the honest reason when there's no Krisp benefit.
const OLD_COND = 's.krispRecommended&&s.krispBenefit&&f.jsxs("div",{className:"p-4 rounded-lg bg-primary/5 border border-primary/15 mb-6"';
const NEW_COND = 's.krispBenefit&&f.jsxs("div",{className:s.krispRecommended?"p-4 rounded-lg bg-primary/5 border border-primary/15 mb-6":"p-4 rounded-lg bg-muted/40 border border-border mb-6"';
if (js.includes(OLD_COND)) {
  js = js.replace(OLD_COND, NEW_COND);
  const t = js.indexOf(NEW_COND);
  const seg = js.slice(t, t + 1200);
  const seg2 = seg
    .replace('" SimplyKrisp Recommendation"', 's.krispRecommended?" How a Krisp helps":" Why a Krisp won\'t help much here"')
    .replace('f.jsxs("a",{href:"https://simplykrisp.com/collections/all"', 's.krispRecommended&&f.jsxs("a",{href:"https://simplykrisp.com/products/double-krisp?utm_source=produce-guide&utm_medium=referral&utm_campaign=guide-detail"')
    .replace('"Get SimplyKrisp "', '"See the Double Krisp "');
  if (seg2 === seg) throw new Error('detail block not patched');
  js = js.slice(0, t) + seg2 + js.slice(t + 1200);
} else if (!js.includes(NEW_COND)) {
  throw new Error('detail block not found');
}

// Home page copy: herbs sit in a jar on the shelf, out of the Krisp's reach.
js = js.replace('(greens, broccoli, herbs) a few more days', '(greens, broccoli, cucumbers) a few more days');

writeFileSync(bundlePath, js);
console.log(`updated ${bundleRel} and seasonal/produce.json: ${rebuilt.length} items, ${Object.keys(RANGE).length} with a Krisp claim`);
