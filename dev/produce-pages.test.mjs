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

test('every item in the storage guide gets its own page', () => {
  const out = render();
  const { produce } = loadData();
  const pages = Object.keys(out).filter((k) => /^produce\/[^/]+\/index\.html$/.test(k) && !k.includes('what-went-wrong'));
  assert.equal(pages.length, produce.length);
  const urls = out['sitemap.xml'].match(/<loc>/g).length;
  assert.equal(urls, produce.length + 6 + loadData().lab.runs.filter((r) => r.status !== 'planned').length);
  // Storage-only page: canonical, no spoilage FAQ, honest Krisp note.
  const apple = out['produce/apple/index.html'];
  assert.match(apple, /<link rel="canonical" href="https:\/\/guide\.simplykrisp\.com\/produce\/apple" \/>/);
  assert.match(apple, /<h1>How to store apples<\/h1>/);
  assert.doesNotMatch(apple, /FAQPage/);
  assert.doesNotMatch(apple, /See the Double Krisp/);
  // No broken grammar from the singular/plural templates.
  for (const [k, html] of Object.entries(out)) assert.doesNotMatch(html, /it're|it are |they is /, k);
  // The app home carries a crawlable list that the app replaces on mount.
  assert.match(out['index.html'], /<div id="root"><!--static-->[\s\S]*href="\/produce\/zucchini"[\s\S]*<!--\/static--><\/div>/);
});

test('catch-all rewrite leaves the static pages alone', () => {
  const v = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const all = v.rewrites.find((r) => r.destination === '/index.html');
  const re = new RegExp('^' + all.source + '$');
  for (const p of ['/produce', '/produce/broccoli', '/produce/what-went-wrong', '/sitemap.xml', '/robots.txt']) assert.ok(!re.test(p), p);
  assert.ok(re.test('/some-guide-route'));
});

test('started Lab Notebook runs get their own crawlable pages', () => {
  const out = render();
  const { lab } = loadData();
  const started = lab.runs.filter((r) => r.status !== 'planned');
  for (const r of started) {
    const html = out[`lab/${r.id}/index.html`];
    assert.ok(html, r.id);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://guide\\.simplykrisp\\.com/lab/${r.id}" />`));
    assert.match(out['sitemap.xml'], new RegExp(`/lab/${r.id}</loc>`));
    assert.match(out['lab/index.html'], new RegExp(`href="/lab/${r.id}"`));
  }
  for (const r of lab.runs.filter((x) => x.status === 'planned')) assert.equal(out[`lab/${r.id}/index.html`], undefined);
  assert.deepEqual(JSON.parse(out['lab/pages.json']), started.map((r) => r.id));
  assert.match(out['produce/broccoli/index.html'], /href="\/lab\/broccoli-01"/);
});
