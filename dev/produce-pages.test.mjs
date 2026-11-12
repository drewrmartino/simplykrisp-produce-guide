// "Why it goes bad" pages: data rules and generated-file freshness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, validate, render } from '../scripts/build-produce-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('spoilage data passes validation', () => {
  assert.deepEqual(validate(loadData()), []);
});

test('validation catches a Krisp claim on a non-ethylene failure', () => {
  const data = loadData();
  const copy = structuredClone(data.spoilage);
  const brocc = copy.items.find((i) => i.name === 'Broccoli');
  const nonEth = brocc.failures.find((f) => !['ethylene', 'ripening'].includes(f.cause));
  nonEth.krispHelps = true;
  assert.ok(validate({ ...data, spoilage: copy }).some((e) => e.includes('krispHelps only applies')));
});

test('validation catches a Krisp claim on an item a Krisp does not help', () => {
  const data = loadData();
  const copy = structuredClone(data.spoilage);
  copy.items.find((i) => i.name === 'Tomato').failures[0].krispHelps = true;
  assert.ok(validate({ ...data, spoilage: copy }).some((e) => e.includes('not in KRISP')));
});

test('committed pages match the generator (run `npm run pages`)', () => {
  for (const [rel, body] of Object.entries(render())) {
    const abs = path.join(root, rel);
    assert.ok(existsSync(abs), `${rel} missing`);
    assert.equal(readFileSync(abs, 'utf8'), body, `${rel} is out of date`);
  }
});

test('pages carry canonical URL, FAQ data and the food-safety note', () => {
  const out = render();
  const html = out['produce/broccoli/index.html'];
  assert.match(html, /<link rel="canonical" href="https:\/\/guide\.simplykrisp\.com\/produce\/broccoli" \/>/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /USDA FSIS/);
  // Krisp only appears on failures marked krispHelps.
  const tomato = out['produce/tomato/index.html'];
  assert.doesNotMatch(tomato, /Where a Krisp fits/);
  assert.match(out['sitemap.xml'], /\/produce\/what-went-wrong/);
});

test('catch-all rewrite leaves the static pages alone', () => {
  const v = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const all = v.rewrites.find((r) => r.destination === '/index.html');
  const re = new RegExp('^' + all.source + '$');
  for (const p of ['/produce', '/produce/broccoli', '/produce/what-went-wrong', '/sitemap.xml', '/robots.txt']) assert.ok(!re.test(p), p);
  assert.ok(re.test('/some-guide-route'));
});
