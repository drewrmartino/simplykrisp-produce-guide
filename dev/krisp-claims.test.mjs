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
import { benefitText, KRISP } from '../scripts/krisp-tiers.mjs';

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
