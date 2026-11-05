// Storage-first cards, storage-guide email event, receipt-photo text and the app manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from './server.mjs';
import { wasteFor, typicalWaste } from '../api/_crisper/impact.js';
import { storageGuide } from '../api/_crisper/storage.js';
import { extractItems } from '../api/_crisper/parser.js';
import manifestHandler, { BASE } from '../api/crisper/manifest.js';
import { CATALOG } from '../api/_crisper/catalog.js';

test('per-item waste rates: USDA where listed, EPA fallback otherwise', () => {
  assert.equal(wasteFor('Lettuce').rate, 0.24);
  assert.equal(wasteFor('Lettuce').source, 'usda');
  assert.equal(wasteFor('Fig').rate, 0.27);
  assert.equal(wasteFor('Fig').source, 'epa');
  for (const c of CATALOG) {
    const w = wasteFor(c.name);
    assert.ok(w.rate > 0 && w.rate < 0.8, c.name);
  }
  const t = typicalWaste({ produce: 'Strawberry', qty: 2 });
  assert.ok(t.usd > 1 && t.usd < 4 && t.lb > 0 && t.co2Lb > 0);
});

test('storage guide lists each item with where/how, shortest-lived first', () => {
  const g = storageGuide([{ name: 'Apple', count: 4 }, { name: 'Lettuce', count: 1 }, { name: 'Banana', count: 6 }, { name: 'Lettuce', count: 1 }], { hasKrisp: true });
  assert.equal(g.guide_items.length, 3);
  assert.equal(g.guide_items[0].name, 'Banana');
  assert.match(g.guide_items[0].keep_away_from, /^Apples/);
  const apple = g.guide_items.find((i) => i.name === 'Apple');
  assert.equal(apple.where, 'Fridge');
  assert.match(apple.keep_away_from, /Lettuce/);
  assert.ok(g.guide_items.every((i) => i.how && i.lasts && i.typically_wasted_pct > 0));
  assert.ok(Number(g.at_risk_usd) > 0);
  const lettuce = g.guide_items.find((i) => i.name === 'Lettuce');
  assert.match(lettuce.krisp, /Your Krisp adds/);
});

test('register-receipt abbreviations (what a receipt photo reads back)', () => {
  const txt = `SMITH'S\nBNNA ORG 2.31 LB @ 0.59/LB 1.36\nROM HRTS 3PK 3.47\nBROC CRWN 1.12 LB 2.23\nGRN ONION 0.88\nSTRAWB 1LB 2.97\nAVOC HASS 4CT 3.98\nMILK 2% GAL 3.48\nSUBTOTAL 18.37`;
  const names = extractItems(txt).items.map((i) => i.name).sort();
  assert.deepEqual(names, ['Avocado', 'Banana', 'Broccoli', 'Green Onion', 'Lettuce', 'Strawberry']);
});

test('manifest: static file matches the API base; personal start_url', async () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url))), BASE);
  assert.equal(BASE.start_url, '/krisper?source=app');
  const out = {};
  const res = { setHeader: (k, v) => { out[k] = v; }, end: (b) => { out.body = b; } };
  manifestHandler({ url: '/api/crisper/manifest?k=abcDEF123_-abcDEF123xyz', query: { k: 'abcDEF123_-abcDEF123xyz' } }, res);
  assert.equal(JSON.parse(out.body).start_url, '/krisper?source=app&k=abcDEF123_-abcDEF123xyz');
  manifestHandler({ url: '/api/crisper/manifest?k=<script>', query: { k: '<script>' } }, res);
  assert.equal(JSON.parse(out.body).start_url, '/krisper?source=app');
});

test('photo receipt saves with the photo channel, items carry storage + waste, guide event fires', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const api = async (p, { method = 'GET', body, key } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-crisper-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try {
    const s = await api('/api/crisper/signup', { method: 'POST', body: { email: 'photo.test@example.com', firstName: 'Pat', tz: 'America/Denver' } });
    const key = s.data.key;
    const r = await api('/api/crisper/receipt', { method: 'POST', key, body: { text: 'BNNA ORG 2.31 LB\nROM HRTS 3PK 3.47\nAPPL HNY CRSP 4CT', channel: 'photo' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.result.added, 3);
    const it = r.data.state.items.find((i) => i.name === 'Lettuce');
    assert.equal(it.source, 'photo');
    assert.ok(it.waste && it.waste.rate === 0.24 && it.waste.usd > 0);
    assert.ok(Array.isArray(it.avoidWith));
    const ev = logs.find((l) => l.includes('[klaviyo disabled] /events') && l.includes('"guide_items":[{"name"'));
    assert.ok(ev, 'storage guide event sent');
  } finally {
    console.log = orig;
    server.close();
  }
});
