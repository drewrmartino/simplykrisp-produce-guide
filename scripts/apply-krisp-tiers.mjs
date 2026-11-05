// Applies the Krisp tiers in scripts/krisp-tiers.mjs to the Storage Guide
// bundle (its produce data is an embedded JSON.parse(`...`) literal) and to
// /seasonal/produce.json, so every page makes the same Krisp claims.
//   node scripts/apply-krisp-tiers.mjs
// Idempotent. Then run `npm run catalog` for My Krisper.
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

const reasons = Object.fromEntries(produce.map((p) => [p.name, p.noBenefitReason || '']));
for (const p of data) {
  if (RANGE[p.name]) {
    p.krispRecommended = true;
    p.krispBenefit = benefitText(p.name, RANGE[p.name], p.storageLocation);
  } else {
    p.krispRecommended = false;
    p.extraDays = 0;
    p.krispBenefit = reasons[p.name] || ''; // shown as "Why a Krisp won't help much here"
  }
}
js = js.slice(0, litStart) + escape(JSON.stringify(data)) + js.slice(litEnd);

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
writeFileSync(bundlePath, js);
console.log(`updated ${bundleRel} and seasonal/produce.json: ${Object.keys(RANGE).length} Krisp items`);
