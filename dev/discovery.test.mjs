// Business details, llms.txt and IndexNow: what search engines and AI assistants read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, ORG_ID } from '../scripts/build-produce-pages.mjs';
import { KEY, fileToPath } from '../scripts/indexnow.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = render();
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('every generated page names Simply Krisp as an Organization', () => {
  for (const [rel, html] of Object.entries(out)) {
    if (!rel.endsWith('.html')) continue;
    const org = ld(html).find((j) => j['@type'] === 'Organization');
    assert.ok(org, `${rel} has no Organization JSON-LD`);
    assert.equal(org['@id'], ORG_ID);
    assert.ok(org.logo.startsWith('https://') && org.sameAs.length, rel);
  }
});

test('guide articles point author and publisher at the one Organization', () => {
  const art = ld(out['produce/how-to/ripen-avocados/index.html']).find((j) => j['@type'] === 'Article');
  assert.deepEqual(art.publisher, { '@id': ORG_ID });
  assert.deepEqual(art.author, { '@id': ORG_ID });
});

test('home page carries Organization and WebSite data exactly once', () => {
  const types = ld(out['index.html']).map((j) => j['@type']);
  assert.deepEqual(types, ['Organization', 'WebSite']);
  assert.equal(render()['index.html'], out['index.html']);
});

test('llms.txt links every guide and produce page and only real URLs', () => {
  const txt = out['llms.txt'];
  assert.match(txt, /^# Simply Krisp Produce Guide\n\n> /);
  const sitemap = new Set([...out['sitemap.xml'].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const guide = [...txt.matchAll(/\]\((https:\/\/guide\.simplykrisp\.com[^)]*)\)/g)].map((m) => m[1]);
  for (const u of guide) if (!u.endsWith('sitemap.xml')) assert.ok(sitemap.has(u) || sitemap.has(u + '/'), `${u} not in sitemap`);
  for (const u of sitemap) if (!u.includes('/lab/crisper-map')) assert.ok(guide.includes(u) || guide.includes(u.replace(/\/$/, '')), `${u} missing from llms.txt`);
});

test('IndexNow key file is committed and matches the script', () => {
  assert.match(KEY, /^[0-9a-f]{32}$/);
  assert.equal(readFileSync(path.join(root, `${KEY}.txt`), 'utf8').trim(), KEY);
});

test('IndexNow maps changed files to page URLs', () => {
  assert.equal(fileToPath('index.html'), '/');
  assert.equal(fileToPath('produce/how-to/ripen-kiwi/index.html'), '/produce/how-to/ripen-kiwi');
  assert.equal(fileToPath('produce/apples/index.html'), '/produce/apples');
  assert.equal(fileToPath('seasonal/index.html'), '/seasonal');
  assert.equal(fileToPath('produce/produce.css'), null);
  assert.equal(fileToPath('data/guides.json'), null);
});
