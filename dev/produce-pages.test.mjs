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

test('Storage Guide bundle, My Krisper catalog and seasonal data agree (run `npm run sync` and `npm run catalog`)', () => {
  const produce = JSON.parse(readFileSync(path.join(root, 'seasonal/produce.json'), 'utf8'));
  const js = readFileSync(path.join(root, 'assets/index-sk20261105.js'), 'utf8');
  const start = js.indexOf('JSON.parse(`[{"id":1,') + 'JSON.parse(`'.length;
  let end = start;
  for (;;) { // closing backtick = first one not preceded by an odd number of backslashes
    end = js.indexOf('`', end);
    let bs = 0;
    for (let k = end - 1; js[k] === '\\'; k--) bs++;
    if (bs % 2 === 0) break;
    end++;
  }
  const bundle = JSON.parse(new Function('return `' + js.slice(start, end) + '`')());
  const catalog = new Map(JSON.parse(readFileSync(path.join(root, 'crisper/catalog.json'), 'utf8')).map((c) => [c.name, c]));
  assert.deepEqual(bundle.map((b) => b.name), produce.map((p) => p.name));
  assert.equal(catalog.size, produce.length);
  for (const p of produce) {
    const b = bundle.find((x) => x.name === p.name);
    const c = catalog.get(p.name);
    for (const k of ['category', 'storageLocation', 'shelfLife', 'ethyleneProduction', 'ethyleneSensitivity']) {
      assert.equal(b[k], p[k], `${p.name} ${k} in the Storage Guide`);
    }
    assert.equal(c.storage, p.storageLocation, `${p.name} storage in My Krisper`);
    assert.equal(c.ethyleneSensitivity, p.ethyleneSensitivity, `${p.name} sensitivity in My Krisper`);
    const claim = p.extraDays > 0;
    assert.equal(p.krispRecommended, claim, `${p.name} krispRecommended follows extraDays`);
    assert.equal(b.krispRecommended, claim, `${p.name} Krisp claim in the Storage Guide`);
    assert.equal(c.krispRecommended, claim, `${p.name} Krisp claim in My Krisper`);
    if (!claim) assert.ok(p.noBenefitReason, `${p.name} says why a Krisp won't help`);
  }
  for (const n of ['Green Onion', 'Celery']) {
    assert.equal(produce.find((p) => p.name === n).krispRecommended, false, `${n} carries no Krisp claim`);
  }
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
  // Every item has a spoilage section now, so the index drops the per-item badge.
  const apple = out['produce/apple/index.html'];
  assert.match(apple, /<link rel="canonical" href="https:\/\/guide\.simplykrisp\.com\/produce\/apple" \/>/);
  assert.match(apple, /<h1>How to store apples, and why they go bad<\/h1>/);
  assert.match(apple, /FAQPage/);
  assert.doesNotMatch(apple, /See the Double Krisp/);
  assert.doesNotMatch(out['produce/index.html'], /Spoilage guide/);
  // Storage-only page (an item added to produce.json before its spoilage entry is written):
  // canonical, no spoilage FAQ, honest Krisp note, and the index badge comes back.
  const data = loadData();
  const partial = render({ ...data, spoilage: { ...data.spoilage, items: data.spoilage.items.filter((i) => i.name !== 'Apple') } });
  const bare = partial['produce/apple/index.html'];
  assert.match(bare, /<link rel="canonical" href="https:\/\/guide\.simplykrisp\.com\/produce\/apple" \/>/);
  assert.match(bare, /<h1>How to store apples<\/h1>/);
  assert.doesNotMatch(bare, /FAQPage/);
  assert.doesNotMatch(bare, /See the Double Krisp/);
  assert.match(partial['produce/index.html'], /<em>Spoilage guide<\/em>/);
  assert.match(partial['produce/index.html'], /Items marked &quot;Spoilage guide&quot;|Items marked "Spoilage guide"/);
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
