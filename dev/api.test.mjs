// End-to-end API test against an in-memory database:
//   signup -> Gmail verification email -> order confirmation -> final receipt
//   -> item actions -> paste -> reminders -> admin scorecard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.mjs';
import * as F from './fixtures.mjs';
import { buildImpact, parseWeightLb, itemImpact } from '../api/_crisper/impact.js';

const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const api = async (p, { method = 'GET', body, key } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-crisper-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
};
const postmark = (slug, email) => ({
  From: email.from, FromFull: { Email: (email.from.match(/<(.+)>/) || [])[1] || email.from, Name: email.from.split('<')[0].trim() },
  To: 'drew.test@gmail.com', OriginalRecipient: `devhash+${slug}@inbound.postmarkapp.com`, MailboxHash: slug,
  Subject: email.subject, TextBody: email.text || '', HtmlBody: email.html || '', Headers: [],
});

let key, slug;

test('signup creates an account with a forwarding address', async () => {
  const r = await api('/api/crisper/signup', { method: 'POST', body: { email: 'Drew.Test@Gmail.com', firstName: 'Drew', tz: 'America/Denver', hasKrisp: true, krispChangedOn: new Date(Date.now() - 27 * 864e5).toISOString().slice(0, 10) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  key = r.data.key;
  assert.ok(key && key.length >= 20);
  const addr = r.data.state.inbox.address;
  assert.match(addr, /^devhash\+[a-z0-9]{10}@inbound\.postmarkapp\.com$/);
  slug = addr.match(/\+(.+)@/)[1];
  assert.equal(r.data.state.krisp.owned, true);
  const again = await api('/api/crisper/signup', { method: 'POST', body: { email: 'drew.test@gmail.com' } });
  assert.equal(again.data.exists, true);
  assert.equal(again.data.key, undefined, 'never hand out a key for an existing email');
});

test('bad key is rejected', async () => {
  const r = await api('/api/crisper/me', { key: 'x'.repeat(32) });
  assert.equal(r.status, 401);
});

test('Gmail verification code is captured and shown', async () => {
  const r = await api('/api/crisper/inbound', { method: 'POST', body: postmark(slug, F.gmailVerification) });
  assert.equal(r.data.type, 'gmail_verification');
  const me = await api('/api/crisper/me', { key });
  assert.equal(me.data.inbox.gmailVerification.code, '614229187');
});

test('confirmation is pending, then the final receipt replaces it', async () => {
  const c = await api('/api/crisper/inbound', { method: 'POST', body: postmark(slug, F.instacartConfirmation) });
  assert.equal(c.data.kind, 'confirmation');
  let me = await api('/api/crisper/me', { key });
  assert.equal(me.data.items.length, 0);
  assert.equal(me.data.pending.length, 5);

  const r = await api('/api/crisper/inbound', { method: 'POST', body: postmark(slug, F.instacartReceipt) });
  assert.equal(r.data.kind, 'receipt');
  me = await api('/api/crisper/me', { key });
  assert.equal(me.data.pending.length, 0, 'pending items replaced');
  const names = me.data.items.map((i) => i.name).sort();
  assert.deepEqual(names, ['Apple', 'Banana', 'Broccoli', 'Green Onion', 'Herbs (Fresh)', 'Lettuce', 'Spinach', 'Strawberry']);
  assert.ok(!names.includes('Blueberry'), 'refunded item not added');
  assert.equal(me.data.receipts.find((x) => x.kind === 'confirmation').status, 'superseded');
  assert.ok(me.data.inbox.firstEmailAt);

  const dup = await api('/api/crisper/inbound', { method: 'POST', body: postmark(slug, F.instacartReceipt) });
  assert.equal(dup.data.duplicate, true);
  me = await api('/api/crisper/me', { key });
  assert.equal(me.data.items.length, 8, 'duplicate receipt not double-counted');
});

test('items are sorted soonest first with Krisp credit on fridge items', async () => {
  const me = await api('/api/crisper/me', { key });
  const order = { check: 0, today: 1, soon: 2, week: 3, later: 4 };
  const ranks = me.data.items.map((i) => order[i.status] * 1000 + i.leftMin);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'sorted soonest first');
  const broccoli = me.data.items.find((i) => i.name === 'Broccoli');
  assert.deepEqual(broccoli.krispBoost, [2, 4]);
  assert.equal(broccoli.label, '5–9 days left');
  const banana = me.data.items.find((i) => i.name === 'Banana');
  assert.equal(banana.krispBoost, null, 'counter items get no Krisp credit');
});

test('item actions: used, tossed, undo, ripening, manual add', async () => {
  let me = await api('/api/crisper/me', { key });
  const berry = me.data.items.find((i) => i.name === 'Strawberry');
  const spinach = me.data.items.find((i) => i.name === 'Spinach');
  await api('/api/crisper/items', { method: 'POST', key, body: { id: berry.id, op: 'used' } });
  me = (await api('/api/crisper/items', { method: 'POST', key, body: { id: spinach.id, op: 'tossed' } })).data;
  assert.equal(me.stats.used30, 1);
  assert.equal(me.stats.tossed30, 1);
  me = (await api('/api/crisper/items', { method: 'POST', key, body: { id: spinach.id, op: 'undo' } })).data;
  assert.equal(me.stats.tossed30, 0);
  const banana = me.items.find((i) => i.name === 'Banana');
  me = (await api('/api/crisper/items', { method: 'POST', key, body: { id: banana.id, op: 'ripening', days: 2 } })).data;
  assert.equal(me.items.find((i) => i.name === 'Banana').ripeningDays, 2);
  me = (await api('/api/crisper/items', { method: 'POST', key, body: { add: [{ produce: 'Raspberry', qty: 1, date: new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10) }] } })).data;
  const rasp = me.items.find((i) => i.name === 'Raspberry');
  assert.equal(rasp.status, 'check');
  assert.equal(me.items[0].name, 'Raspberry', 'past-window item sorts first');
  const bad = await api('/api/crisper/items', { method: 'POST', key, body: { add: [{ produce: 'Durian' }] } });
  assert.equal(bad.status, 400);
});

test('impact tracker is returned with the dashboard', async () => {
  const me = await api('/api/crisper/me', { key });
  const im = me.data.impact;
  assert.ok(im && im.last30 && im.allTime && im.streak && im.level && Array.isArray(im.badges));
  assert.equal(im.last30.usedCount + im.last30.tossedCount >= 1, true);
  assert.ok(im.allTime.usedLb >= 0 && im.allTime.tossedUsd >= 0);
});

test('impact math: weights, money, CO2, streaks, badges', () => {
  assert.equal(parseWeightLb('1.5 lb'), 1.5);
  assert.equal(parseWeightLb('8 oz'), 0.5);
  assert.equal(parseWeightLb('2 ct'), null);
  const banana = itemImpact({ produce: 'Banana', qty: 6, weight: null });
  assert.ok(Math.abs(banana.lb - 1.98) < 0.01);
  assert.ok(Math.abs(banana.usd - 1.98 * 0.61) < 0.01);
  const today = '2026-11-04'; // a Wednesday
  const at = (d) => `${d}T18:00:00Z`;
  const rows = [
    { produce: 'Apple', qty: 4, state: 'used', state_at: at('2026-10-20'), rescued: true },  // week of 10/19: clean
    { produce: 'Strawberry', qty: 1, weight: '1 lb', state: 'used', state_at: at('2026-10-28') }, // week of 10/26: clean
    { produce: 'Spinach', qty: 1, state: 'used', state_at: at('2026-11-03') }, // this week: clean so far
    { produce: 'Lettuce', qty: 1, state: 'tossed', state_at: at('2026-10-14') }, // week of 10/12: toss
  ];
  const im = buildImpact(rows, { today, tz: 'UTC', krisp: { owned: false } });
  assert.equal(im.allTime.usedCount, 3);
  assert.equal(im.allTime.tossedCount, 1);
  assert.equal(im.allTime.rescued, 1);
  assert.equal(im.allTime.tossedLb, 1);
  assert.equal(im.allTime.tossedUsd, 2);
  assert.ok(im.allTime.tossedCo2Kg === 0.2 && im.allTime.tossedCo2Lb === 0.5);
  assert.equal(im.streak.cleanWeeks, 3);
  assert.equal(im.streak.daysSinceToss, 21);
  assert.equal(im.level.points, 4);
  const ids = im.badges.filter((b) => b.earned).map((b) => b.id);
  assert.deepEqual(ids.sort(), ['clean1', 'clean3', 'first', 'rescue']);
  const tossedNow = buildImpact(rows.concat({ produce: 'Kale', qty: 1, state: 'tossed', state_at: at('2026-11-04') }), { today, tz: 'UTC' });
  assert.equal(tossedNow.streak.cleanWeeks, 0);
  assert.equal(tossedNow.streak.bestCleanWeeks, 2); // this week no longer counts
});

test('paste a receipt: preview then save', async () => {
  const p = await api('/api/crisper/receipt', { method: 'POST', key, body: { text: F.pastedReceipt.text, preview: true } });
  assert.equal(p.data.preview.items.length, 7);
  const s = await api('/api/crisper/receipt', { method: 'POST', key, body: { text: F.pastedReceipt.text } });
  assert.equal(s.data.result.added, 7);
});

test('settings and reminders', async () => {
  const s = await api('/api/crisper/me', { method: 'POST', key, body: { settings: { reminderPref: 'smart', firstName: 'Drew' } } });
  assert.equal(s.data.user.reminderPref, 'smart');
  const admin = await api('/api/crisper/admin?key=dev-admin&preview=1');
  assert.equal(admin.status, 200);
  assert.equal(admin.data.funnel.signups, 1);
  assert.equal(admin.data.funnel.email_connected, 1);
  assert.equal(admin.data.reminderPreview.sent, 1);
  const cron = await api('/api/crisper/cron');
  assert.equal(cron.data.sent, 1);
  const again = await api('/api/crisper/cron');
  assert.equal(again.data.sent, 0, 'no second reminder the same day');
  const noAdmin = await api('/api/crisper/admin?key=nope');
  assert.equal(noAdmin.status, 403);
});

test('unknown slug is ignored, not an error', async () => {
  const r = await api('/api/crisper/inbound', { method: 'POST', body: postmark('zzzzzzzzzz', F.walmartDelivered) });
  assert.equal(r.status, 200);
  assert.equal(r.data.ignored, 'unknown recipient');
});

test('delete account removes everything', async () => {
  const r = await api('/api/crisper/me', { method: 'POST', key, body: { deleteAccount: true } });
  assert.equal(r.data.deleted, true);
  const me = await api('/api/crisper/me', { key });
  assert.equal(me.status, 401);
  server.close();
});
