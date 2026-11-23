// Claims guard: no surface built from this repo may attribute a day count or a
// strength claim to the Krisp sachet. The claims ledger marks "Produce lasts X
// days longer" as UNSUPPORTED (no household test of this sachet). Supported:
// it absorbs ethylene in a closed drawer, which matters most when apples,
// pears or bananas share the fridge. Storage shelf-life ranges are fine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storageGuide } from '../api/_crisper/storage.js';
import { benefitText, KRISP, PRODUCERS } from '../scripts/krisp-tiers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Everything users can see: built pages, bundles, generated data and the API
// modules that write emails and push text.
const ROOTS = ['index.html', 'llms.txt', 'assets', 'seasonal', 'crisper', 'partners', 'produce', 'lab', 'data', 'api', 'app/APP_STORE.md'];
const EXT = /\.(html|js|mjs|json|txt|md)$/;
function walk(rel, out = []) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return out;
  if (statSync(abs).isDirectory()) {
    for (const f of readdirSync(abs)) if (f !== 'vendor' && f !== 'node_modules') walk(path.join(rel, f), out);
  } else if (EXT.test(rel)) out.push(rel);
  return out;
}

// Pieces of copy: split on tags, quotes, line breaks and sentence ends.
const pieces = (s) => s.split(/<[^>]*>|\\n|\\"|["`\n]|(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

const DAYS = /\b\d+\s*(?:(?:–|-|to)\s*\d+\s*)?(?:extra |more |additional )?days?\b/i;
const CHIP = /\+\s?\d+\s?(?:[–-]\s?\d+\s?)?d(?:ays?)?\b/;
const ADDS = /\b(?:would add|adds?)\b[^.]{0,30}\b(?:up to |about |another |a few )?\d/i;
const STRENGTH = /real difference|helps a little|lasts? (?:days )?longer|days longer|extra days|more days|would add|Krisp adds|proven/i;
// Sachet-life copy ("each sachet works for about 30 days", swap reminders) is about
// the sachet, not the produce.
const SACHET_LIFE = /sachet[^.]*\b(?:works|lasts|swap|change|fresh|old|left|past)\b|\b(?:swap|change|replace)\b[^.]*sachet/i;

export function findClaims(text) {
  const hits = [];
  for (const raw of pieces(text)) {
    // Brand in a title suffix or a URL isn't a claim about the sachet.
    const p = raw.replace(/https?:\/\/\S+/g, '').replace(/\|\s*Simply ?Krisp/gi, '');
    if (CHIP.test(p) && /krisp|day/i.test(p)) hits.push(p);
    // "One would add up to 3 days" follows "No Krisp in your drawers." as its own sentence.
    if (ADDS.test(p) && DAYS.test(p)) { hits.push(p); continue; }
    if (!/krisp|absorber/i.test(p)) continue;
    if (STRENGTH.test(p)) hits.push(p);
    else if (DAYS.test(p) && !SACHET_LIFE.test(p)) hits.push(p);
  }
  return hits;
}

test('the guard catches the old claim wording', () => {
  for (const bad of [
    'A Krisp adds 2–3 days',
    'Simply Krisp helps: about 3–5 extra days in the drawer.',
    '<span class="kd">+2–4 days</span>',
    'No Krisp in your drawers. One would add up to 3 days to 4 items.',
    'A Krisp makes a real difference here.',
    'A Krisp helps a little here.',
    'Put a Simply Krisp in the drawer and it lasts days longer.',
  ]) assert.ok(findClaims(bad).length, bad);
  for (const ok of [
    'Ethylene speeds the leaves yellowing. A Krisp absorbs ethylene in a closed crisper drawer, which matters most when apples, pears or bananas share the fridge.',
    'Each sachet works for about 30 days.',
    'Broccoli keeps 3–5 days in the fridge.',
    'How to organize your fridge so produce lasts longer | Simply Krisp',
  ]) assert.deepEqual(findClaims(ok), [], ok);
});

test('no built output attributes days or strength to the Krisp', () => {
  const files = ROOTS.flatMap((r) => walk(r));
  assert.ok(files.length > 100, `scanned ${files.length} files`);
  const bad = [];
  for (const f of files) for (const h of findClaims(readFileSync(path.join(root, f), 'utf8'))) bad.push(`${f}: ${h.slice(0, 160)}`);
  assert.deepEqual(bad, []);
});

test('Krisp notes and Storage Guide email props carry no day counts', () => {
  for (const name of Object.keys(KRISP)) {
    const t = benefitText(name);
    assert.match(t, /absorbs ethylene in a closed crisper drawer/);
    assert.doesNotMatch(t, /\d/, `${name} Krisp note has a number`);
  }
  const g = storageGuide(Object.keys(KRISP).map((name) => ({ name })), { hasKrisp: true });
  const g2 = storageGuide(Object.keys(KRISP).map((name) => ({ name })));
  assert.deepEqual(findClaims(JSON.stringify(g)), []);
  assert.deepEqual(findClaims(JSON.stringify(g2)), []);
  for (const i of g.guide_items) if (i.krisp) assert.doesNotMatch(i.krisp, /\d/, i.name);
  for (const z of Object.values(g.kitchen)) for (const i of z) assert.ok(i.krisp_days === '' || i.krisp_days === 'Ethylene-sensitive', i.krisp_days);
});

// The old hidden Krisp day estimates (krispExtra [1,2], [2,3], [2,4] in
// crisper/catalog.json; extraDays / extraDaysRange in produce.json and the
// Storage Guide bundle) must never come back, under any name.
const DATA = ['crisper/catalog.json', 'api/_crisper/catalog.js', 'seasonal/produce.json', 'assets/index-sk20261105.js', 'partners/engine.js'];
const DAY_KEY = /["']?\b(krispExtra|extraDays|extraDaysRange|krispDays|krispBoost|krispCould)\b["']?\s*:\s*([^,}\]]+|\[[^\]]*\])/g;

test('no Krisp day ranges or day keys in the catalog, produce data or bundles', () => {
  const bad = [];
  for (const f of DATA) {
    const s = readFileSync(path.join(root, f), 'utf8');
    for (const m of s.matchAll(DAY_KEY)) {
      // shelf.js keeps krispBoost/krispCould as null for old app builds; data
      // files must not carry them at all.
      bad.push(`${f}: ${m[0].slice(0, 80)}`);
    }
    for (const m of s.matchAll(/["']?krisp\w*["']?\s*:\s*\[\s*\d+\s*,\s*\d+\s*\]/gi)) bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
  const cat = JSON.parse(readFileSync(path.join(root, 'crisper/catalog.json'), 'utf8'));
  const items = Array.isArray(cat) ? cat : cat.items;
  assert.ok(items.length > 50);
  for (const i of items) for (const [k, v] of Object.entries(i)) {
    if (/krisp/i.test(k)) assert.ok(!(Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)), `${i.name}.${k} is a day range`);
  }
});

test('the guard catches a krispExtra range coming back', () => {
  const s = JSON.stringify([{ name: 'Pear', krispExtra: [1, 2] }]);
  assert.ok([...s.matchAll(DAY_KEY)].length);
  assert.ok([...'{"extraDays":3,"extraDaysRange":"2-4"}'.matchAll(DAY_KEY)].length === 2);
});

test('every krispRecommended item cites an https source for that item', () => {
  for (const [name, t] of Object.entries(KRISP)) {
    const src = t[2];
    assert.ok(src && /^https:\/\//.test(src.url), `${name} in KRISP has no https source URL`);
    assert.ok(src.name && src.note, `${name} source needs a name and a note`);
    assert.doesNotMatch(`${src.name} ${src.note}`, /closely related|close relative|our read|estimated/i, `${name} source is not about the item itself`);
  }
  const cat = JSON.parse(readFileSync(path.join(root, 'crisper/catalog.json'), 'utf8'));
  const items = Array.isArray(cat) ? cat : cat.items;
  const rec = items.filter((i) => i.krispRecommended || i.krispTier);
  assert.equal(rec.length, Object.keys(KRISP).length);
  for (const i of rec) {
    assert.ok(i.krispSource && /^https:\/\//.test(i.krispSource.url), `${i.name} in catalog.json has no source URL`);
    assert.ok(i.krispEvidence, `${i.name} in catalog.json has no evidence line`);
  }
  for (const i of items) if (!i.krispRecommended) assert.equal(i.krispSource, null, `${i.name} has a source but no Krisp note`);
  const produce = JSON.parse(readFileSync(path.join(root, 'seasonal/produce.json'), 'utf8'));
  for (const p of produce) {
    if (p.krispRecommended) assert.ok(p.ethyleneSource && /^https:\/\//.test(p.ethyleneSource.url), `${p.name} in produce.json has no source URL`);
    assert.equal(p.evidence, undefined, `${p.name} still has the old evidence category`);
  }
});

test('pear, avocado and apple are ethylene producers with no Krisp note', () => {
  const cat = JSON.parse(readFileSync(path.join(root, 'crisper/catalog.json'), 'utf8'));
  const items = Array.isArray(cat) ? cat : cat.items;
  for (const name of Object.keys(PRODUCERS)) {
    assert.ok(/^https:\/\//.test(PRODUCERS[name].url), `${name} producer source`);
    const i = items.find((x) => x.name === name);
    assert.ok(i, name);
    assert.equal(i.ethyleneProducer, true, `${name} is tagged an ethylene producer`);
    assert.equal(i.krispRecommended, false, `${name} has no Krisp note`);
    assert.equal(i.krispTier, null, `${name} has no Krisp tier`);
    assert.match(i.krispNoBenefit, /apart from greens/, `${name} says to store it apart`);
    assert.equal(KRISP[name], undefined, `${name} is not in KRISP`);
  }
});
