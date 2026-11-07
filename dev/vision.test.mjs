// Receipt photo -> AI reader -> parser, against a fake AI Gateway; plus the
// free parser fixes (quantity-only lines, OCR junk, register abbreviations).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let gwMode = 'ok', gwSeen = null;
const gw = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    gwSeen = { auth: req.headers.authorization, body: JSON.parse(b) };
    if (gwMode === 'down') { res.writeHead(500); return res.end('boom'); }
    const content = JSON.stringify({ store: 'Smith\'s', lines: [
      { text: 'Broccoli crowns', qty: 2, produce: 'Broccoli' },
      { text: 'Organic bananas', qty: 1, produce: 'Banana' },
      { text: 'Frozen strawberries', qty: 1, produce: null },
      { text: 'Rainier cherries', qty: 1, produce: 'Cherry' },
      { text: 'Tortilla chips', qty: 1, produce: null },
    ] });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '```json\n' + content + '\n```' } }] }));
  });
});
await new Promise((r) => gw.listen(0, r));
process.env.CRISPER_GATEWAY_URL = `http://localhost:${gw.address().port}/v1/chat/completions`;
process.env.AI_GATEWAY_API_KEY = 'test-key';

const { createServer } = await import('./server.mjs');
const { extractItems } = await import('../api/_crisper/parser.js');
const { CATALOG } = await import('../api/_crisper/catalog.js');
const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const api = async (p, { body, key } = {}) => {
  const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-crisper-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
};
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fake').toString('base64');
const hasCherry = CATALOG.some((c) => c.name === 'Cherry');
let key;

test('photo is read by the AI reader and filtered by the parser', async () => {
  const s = await api('/api/crisper/signup', { body: { email: 'photo.test@gmail.com', tz: 'America/Denver' } });
  key = s.data.key;
  const r = await api('/api/crisper/receipt', { key, body: { images: [IMG], preview: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(gwSeen.auth, 'Bearer test-key');
  assert.equal(gwSeen.body.messages[1].content[1].image_url.url, IMG);
  assert.equal(r.data.ai, true);
  assert.match(r.data.text, /2 x Broccoli crowns/);
  const names = r.data.preview.items.map((i) => i.name);
  assert.ok(names.includes('Broccoli') && names.includes('Banana'));
  assert.equal(r.data.preview.items.find((i) => i.name === 'Broccoli').count, 2);
  assert.ok(!names.includes('Strawberry'), 'frozen skipped by the parser');
  if (hasCherry) assert.ok(names.includes('Cherry'), 'model produce hint used when the parser had no match');
  assert.equal(r.data.preview.retailer, "Smith's");
  // Save with the reviewed list
  const save = await api('/api/crisper/receipt', { key, body: { text: r.data.text, channel: 'photo', keep: [{ name: 'Broccoli', count: 2 }, { name: 'Banana', count: 1 }] } });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  assert.deepEqual(save.data.state.items.map((i) => i.name).sort(), ['Banana', 'Broccoli']);
});

test('gateway failure returns 503 so the page falls back to on-device reading', async () => {
  gwMode = 'down';
  const r = await api('/api/crisper/receipt', { key, body: { images: [IMG], preview: true } });
  assert.equal(r.status, 503);
  gwMode = 'ok';
  const bad = await api('/api/crisper/receipt', { key, body: { images: ['data:text/plain;base64,aGk='], preview: true } });
  assert.equal(bad.status, 400);
});

test('quantity-only lines attach to the item above and are never unknown', () => {
  const r = extractItems('Organic Bananas\n$0.99\n1 bunch\nCelery Hearts\n2 each\nHeavy Whipping Cream\n1 each\nvil KB Fresh Dinnd. %\n|. Bag Points NP 0.00 F\nSC GRN BAG LIMIT, 10');
  assert.deepEqual(r.items.map((i) => [i.name, i.count]), [['Banana', 1], ['Celery', 2]]);
  assert.deepEqual(r.unknown, []);
});

test('more register abbreviations', () => {
  const r = extractItems('BRCLI CRWN 2 @ 1.29\nHNYCRSP APL 3 LB\nAVCDO HASS\nRMN HRTS 3PK\nCLNTRO BNCH');
  assert.deepEqual(r.items.map((i) => i.name), ['Broccoli', 'Apple', 'Avocado', 'Lettuce', 'Herbs (Fresh)']);
  assert.equal(r.items[0].count, 2);
});

test.after(() => { server.close(); gw.close(); });

test('feedback is saved and shown on the admin page', async () => {
  const s = await api('/api/crisper/signup', { body: { email: 'fb.test@gmail.com', tz: 'America/Denver' } });
  const k = s.data.key;
  const empty = await api('/api/crisper/me', { key: k, body: { feedback: { text: ' ' } } });
  assert.equal(empty.status, 400);
  const r = await api('/api/crisper/me', { key: k, body: { feedback: { text: 'Photo missed the cilantro', kind: 'problem', page: 'receipt' } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const adminKey = process.env.CRISPER_ADMIN_KEY || 'dev-admin';
  const a = await api('/api/crisper/admin?key=' + adminKey);
  assert.equal(a.status, 200);
  const f = a.data.feedback.find((x) => x.email === 'fb.test@gmail.com');
  assert.equal(f.text, 'Photo missed the cilantro');
  assert.equal(f.kind, 'problem');
});
