// End-to-end API test against an in-memory database:
//   signup -> Gmail verification email -> order confirmation -> final receipt
//   -> item actions -> paste -> reminders -> admin scorecard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.mjs';
import * as F from './fixtures.mjs';
import { buildImpact, parseWeightLb, itemImpact, rescueStats } from '../api/_crisper/impact.js';
import { pilotFor, periodFor } from '../api/_crisper/pilot.js';
import { tempView, rescueOptions } from '../api/_crisper/rescue.js';

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
  assert.deepEqual(names, ['Apple', 'Banana', 'Broccoli', 'Cilantro', 'Green Onion', 'Lettuce', 'Spinach', 'Strawberry']);
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
  assert.equal(broccoli.krispTier, 'strong');
  assert.match(broccoli.krispPrevents, /yellow/);
  const banana = me.data.items.find((i) => i.name === 'Banana');
  assert.equal(banana.krispBoost, null, 'counter items get no Krisp credit');
  const herbs = me.data.items.find((i) => i.name === 'Cilantro');
  assert.equal(herbs.krispBoost, null, 'shelf items are out of the Krisp\'s reach');
  assert.match(herbs.krispNoBenefit, /jar on the shelf/);
  const berry = me.data.items.find((i) => i.name === 'Strawberry');
  assert.equal(berry.krispBoost, null, 'berries barely react to ethylene');
  assert.equal(berry.krispCould, null);
  const scallion = me.data.items.find((i) => i.name === 'Green Onion');
  assert.equal(scallion.krispBoost, null, 'green onions do not react to outside ethylene');
  assert.match(scallion.krispNoBenefit, /don't react to ethylene/);
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
  me = (await api('/api/crisper/items', { method: 'POST', key, body: { add: [{ produce: 'Raspberry', qty: 1, date: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10) }] } })).data;
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
  assert.equal(im.allTime.tossedLb, 0.9); // 1 lb lettuce minus its 6% core
  assert.equal(im.allTime.tossedUsd, 2);
  assert.ok(im.allTime.tossedCo2Kg === 0.2 && im.allTime.tossedCo2Lb === 0.5);
  assert.equal(im.streak.cleanWeeks, 3);
  assert.equal(im.streak.daysSinceToss, 21);
  assert.equal(im.level.points, 4);
  const ids = im.badges.filter((b) => b.earned).map((b) => b.id);
  assert.deepEqual(ids.sort(), ['clean1', 'clean3', 'first', 'rescue']);
  // partial toss + trim
  const part = buildImpact([
    { produce: 'Broccoli', qty: 1, weight: '1 lb', state: 'used', tossed_frac: 0.5, trim: 'compost', state_at: at('2026-11-03') },
    { produce: 'Corn', qty: 2, state: 'used', tossed_frac: 0, trim: 'used', state_at: at('2026-11-03') },
  ], { today, tz: 'UTC' });
  assert.equal(part.allTime.partialCount, 1);
  assert.equal(part.allTime.tossedUsd, 1.51); // half of $3.02
  assert.equal(part.allTime.trim.compostLb, 0.4); // 39% of 1 lb
  assert.equal(part.allTime.trim.usedLb, 0.8); // 64% of 1.2 lb
  assert.equal(part.level.points, 4); // 2 eaten + 2 scraps saved
  assert.equal(part.streak.cleanWeeks, 0, 'half or more tossed breaks a clean week');
  assert.ok(part.badges.find((b) => b.id === 'scrap').earned);
  const tossedNow = buildImpact(rows.concat({ produce: 'Kale', qty: 1, state: 'tossed', state_at: at('2026-11-04') }), { today, tz: 'UTC' });
  assert.equal(tossedNow.streak.cleanWeeks, 0);
  assert.equal(tossedNow.streak.bestCleanWeeks, 2); // this week no longer counts
});

test('finish: partial toss with trim, then edit trim', async () => {
  const me = await api('/api/crisper/me', { key });
  const it = me.data.items.find((i) => i.scrap);
  assert.ok(it && it.scrap.ideas.length >= 2);
  let r = await api('/api/crisper/items', { method: 'POST', key, body: { id: it.id, op: 'finish', portion: 0.25, trim: 'compost' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = r.data.recentDone.find((x) => x.id === it.id);
  assert.equal(d.state, 'used'); assert.equal(d.tossedFrac, 0.25); assert.equal(d.trim, 'compost');
  r = await api('/api/crisper/items', { method: 'POST', key, body: { id: it.id, op: 'trim', trim: 'used' } });
  assert.equal(r.data.recentDone.find((x) => x.id === it.id).trim, 'used');
  assert.ok(r.data.impact.allTime.trim.usedCount >= 1);
  r = await api('/api/crisper/items', { method: 'POST', key, body: { id: it.id, op: 'undo' } });
  assert.ok(r.data.items.find((x) => x.id === it.id));
});

test('quantities: bought 6, eat 2, toss 1, undo, finish the rest', async () => {
  const P = (body) => api('/api/crisper/items', { method: 'POST', key, body });
  let r = await P({ add: [{ produce: 'Peach', qty: 6 }] });
  let it = r.data.items.find((i) => i.name === 'Peach');
  assert.equal(it.qty, 6); assert.equal(it.bought, 6); assert.equal(it.usedN, 0);
  const used0 = r.data.stats.used30, added0 = r.data.stats.added30;

  r = await P({ id: it.id, op: 'count', kind: 'used', count: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  it = r.data.items.find((i) => i.id === it.id);
  assert.equal(it.qty, 4); assert.equal(it.bought, 6); assert.equal(it.usedN, 2);
  assert.equal(r.data.last.left, 4);
  const eatId = r.data.last.id;
  assert.notEqual(eatId, it.id);
  assert.equal(r.data.recentDone.find((x) => x.id === eatId).qty, 2);
  assert.equal(r.data.stats.used30, used0 + 1);
  assert.equal(r.data.stats.added30, added0, 'eating some is not a new purchase');
  assert.equal(r.data.lastTrip.find((x) => x.name === 'Peach').count, 6, 'last trip remembers what was bought');

  r = await P({ id: it.id, op: 'count', kind: 'tossed', count: 1 });
  it = r.data.items.find((i) => i.id === it.id);
  assert.equal(it.qty, 3); assert.equal(it.tossedN, 1);

  r = await P({ id: eatId, op: 'undo' });
  it = r.data.items.find((i) => i.id === it.id);
  assert.equal(it.qty, 5, 'undo puts the 2 back'); assert.equal(it.usedN, 0); assert.equal(it.bought, 6);
  assert.ok(!r.data.recentDone.find((x) => x.id === eatId));

  r = await P({ id: it.id, op: 'edit', qty: 4 });
  it = r.data.items.find((i) => i.id === it.id);
  assert.equal(it.qty, 4); assert.equal(it.bought, 5, 'edit keeps the tossed one in the bought count');

  r = await P({ id: it.id, op: 'count', kind: 'used', count: 9 });
  assert.ok(!r.data.items.find((i) => i.id === it.id), 'eating the rest finishes it');
  assert.equal(r.data.last.left, 0);
  assert.equal(r.data.recentDone.find((x) => x.id === it.id).state, 'used');
  r = await P({ id: it.id, op: 'undo' });
  assert.equal(r.data.items.find((i) => i.id === it.id).qty, 4);
  r = await P({ id: it.id, op: 'delete' });
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
  // On the shop day the before-you-shop email replaces the use-soon reminder,
  // so turn it off here or this test fails every Friday (the default shop day).
  await api('/api/crisper/items', { method: 'POST', key, body: { shopDay: 'off' } });
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

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const P = (body) => api('/api/crisper/items', { method: 'POST', key, body });

test('rescue card: picks the item closest to going bad; eating it counts as a rescue', async () => {
  let me = (await api('/api/crisper/me', { key })).data;
  assert.deepEqual(Object.values(me.features), Object.values(me.features).map(() => true), 'not in a pilot: everything on');
  assert.ok(me.rescue, 'rescue card data present');
  const due = me.items.filter((i) => ['today', 'soon'].includes(i.status) || (i.status === 'check' && i.leftMax >= -2));
  assert.ok(due.length, 'fixture fridge has something due');
  assert.equal(me.rescue.itemId, due[0].id, 'first due item in sort order');
  assert.equal(me.rescue.today, false);
  const r = await P({ id: me.rescue.itemId, op: 'used', via: 'rescue_card' });
  me = r.data;
  assert.equal(me.rescue.today, true);
  assert.equal(me.rescue.streakDays, 1);
  assert.ok(me.rescue.weekCount >= 1 && me.rescue.weekUsd > 0);
  assert.equal(me.rescue.usdEstimated, true);
  assert.notEqual(me.rescue.itemId, due[0].id, 'the next due item takes its place');
});

test('rescue streak counts consecutive days', () => {
  const at = (d) => `${d}T15:00:00Z`;
  const rows = [
    { produce: 'Apple', qty: 1, state: 'used', rescued: true, state_at: at('2026-11-02') },
    { produce: 'Apple', qty: 1, state: 'used', rescued: true, state_at: at('2026-11-03') },
    { produce: 'Apple', qty: 1, state: 'used', rescued: true, state_at: at('2026-11-04') },
    { produce: 'Pear', qty: 1, state: 'used', rescued: false, state_at: at('2026-11-05') },
    { produce: 'Lettuce', qty: 1, state: 'tossed', rescued: false, state_at: at('2026-11-05') },
  ];
  assert.equal(rescueStats(rows, '2026-11-05', 'UTC').streakDays, 3, 'nothing yet today: streak still counts through yesterday');
  assert.equal(rescueStats(rows, '2026-11-06', 'UTC').streakDays, 0, 'a missed day breaks it');
  const s = rescueStats(rows, '2026-11-04', 'UTC');
  assert.equal(s.today, true); assert.equal(s.bestStreakDays, 3); assert.equal(s.weekCount, 3);
  assert.deepEqual(s.todayNames, ['Apple']);
});

test('rescue options: cook, freeze, ferment on due items only', async () => {
  const me = (await api('/api/crisper/me', { key })).data;
  for (const i of me.items) {
    const due = ['today', 'soon'].includes(i.status) || (i.status === 'check' && i.leftMax >= -2);
    assert.equal(!!i.rescueOptions, due, `${i.name} ${i.status}`);
  }
  const rasp = rescueOptions({ name: 'Raspberry' });
  assert.equal(rasp.freeze.note, 'Freeze for smoothies'); assert.equal(rasp.freeze.fromCatalog, true);
  assert.equal(rasp.ferment, null);
  const cuke = rescueOptions({ name: 'Cucumber' });
  assert.equal(cuke.freeze.url, 'https://nchfp.uga.edu/how/freeze/freeze-general-information/blanching-times/');
  assert.equal(cuke.freeze.fromCatalog, false);
  assert.match(cuke.ferment.tip, /tested recipe/);
  assert.equal(rescueOptions({ name: 'Lettuce' }).freeze, null, 'no freeze advice for salad greens');
  assert.equal(rescueOptions({ name: 'Herbs (Fresh)' }).cook.query, 'herbs');
});

test('toss reasons: stored on the finished row, fix per reason, undo clears it', async () => {
  let r = await P({ add: [{ produce: 'Spinach', qty: 1, date: daysAgo(2) }, { produce: 'Kale', qty: 1 }] });
  const sp = r.data.items.find((i) => i.name === 'Spinach' && i.boughtDate === daysAgo(2));
  const kale = r.data.items.find((i) => i.name === 'Kale');
  assert.equal((await P({ id: sp.id, op: 'reason', reason: 'spoiled' })).status, 400, 'not tossed yet');
  await P({ id: sp.id, op: 'tossed' });
  assert.equal((await P({ id: sp.id, op: 'reason', reason: 'meh' })).status, 400);
  r = await P({ id: sp.id, op: 'reason', reason: 'spoiled' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.last.reason, 'spoiled');
  assert.match(r.data.last.fix.tip, /\w/);
  assert.match(r.data.last.fix.text, /34-37°F/);
  assert.equal(r.data.recentDone.find((x) => x.id === sp.id).tossReason, 'spoiled');
  r = await P({ id: sp.id, op: 'reason', reason: 'forgot' });
  assert.ok(r.data.last.fix.similar.some((x) => x.id === kale.id), 'Kale is in the same drawer');
  assert.equal(r.data.last.fix.remindersOn, true);
  r = await P({ id: sp.id, op: 'reason', reason: 'disliked' });
  assert.equal(r.data.last.fix.recipeQuery, 'spinach');
  r = await P({ id: sp.id, op: 'reason', reason: 'skip' });
  assert.equal(r.data.recentDone.find((x) => x.id === sp.id).tossReason, null);
  await P({ id: sp.id, op: 'reason', reason: 'too_much' });
  r = await P({ id: sp.id, op: 'undo' });
  await P({ id: sp.id, op: 'tossed' });
  r = (await api('/api/crisper/me', { key }));
  assert.equal(r.data.recentDone.find((x) => x.id === sp.id).tossReason, null, 'undo cleared the old reason');
  // partial toss takes a reason too
  r = await P({ id: kale.id, op: 'finish', portion: 0.5 });
  r = await P({ id: kale.id, op: 'reason', reason: 'too_much' });
  assert.equal(r.data.last.fix.reason, 'too_much');
  assert.match(r.data.last.fix.text, /less kale/);
});

test('eat first: flag one, flag several, shown on the item', async () => {
  let me = (await api('/api/crisper/me', { key })).data;
  const [a, b] = me.items;
  let r = await P({ id: a.id, op: 'eatfirst', on: true });
  assert.equal(r.data.last.eatFirst, true);
  assert.equal(r.data.items.find((i) => i.id === a.id).eatFirst, true);
  r = await P({ eatFirst: [a.id, b.id], on: false });
  assert.ok(!r.data.items.find((i) => i.id === a.id).eatFirst && !r.data.items.find((i) => i.id === b.id).eatFirst);
  r = await P({ eatFirst: [b.id] });
  assert.equal(r.data.items.find((i) => i.id === b.id).eatFirst, true);
});

test('before you shop: still on hand and buy less', async () => {
  let r = await P({ add: [{ produce: 'Plum', qty: 4 }] });
  const plum = r.data.items.find((i) => i.name === 'Plum');
  r = await P({ id: plum.id, op: 'count', kind: 'tossed', count: 2 });
  const sh = r.data.shopping;
  assert.ok(sh, 'shopping list present');
  const have = sh.have.find((h) => h.name === 'Plum');
  assert.equal(have.qty, 2, 'two plums still on hand');
  const total = r.data.items.reduce((a, i) => a + i.qty, 0);
  assert.equal(sh.have.reduce((a, h) => a + h.qty, 0), total);
  const lessPlum = sh.buyLess.find((b) => b.name === 'Plum');
  assert.equal(lessPlum.why, 'tossed_half'); assert.equal(lessPlum.lastBought, 4); assert.equal(lessPlum.suggest, 2);
  const lessKale = sh.buyLess.find((b) => b.name === 'Kale');
  assert.equal(lessKale.why, 'too_much'); assert.equal(lessKale.suggest, null, 'bought 1: suggest a smaller size');
  assert.ok(!sh.buyLess.find((b) => b.name === 'Apple'), 'eaten items are not flagged');
  const trip = sh.lastTrip.find((t) => t.name === 'Plum');
  assert.equal(trip.have, 2); assert.equal(trip.buyLess, 2);
});

test('fridge thermometer: reading, guidance and re-check', async () => {
  let r = await api('/api/crisper/me', { method: 'POST', key, body: { settings: { fridgeTempF: 42 } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.fridgeTemp.f, 42);
  assert.equal(r.data.user.fridgeTemp.status, 'too_warm');
  assert.match(r.data.user.fridgeTemp.message, /FDA/);
  r = await api('/api/crisper/me', { method: 'POST', key, body: { settings: { fridgeTempF: 36 } } });
  assert.equal(r.data.user.fridgeTemp.status, 'good');
  assert.equal(r.data.user.fridgeTemp.recheckDue, false);
  assert.equal((await api('/api/crisper/me', { method: 'POST', key, body: { settings: { fridgeTempF: 'cold' } } })).status, 400);
  assert.equal((await api('/api/crisper/me', { method: 'POST', key, body: { settings: { fridgeTempF: 75 } } })).status, 400);
  const old = tempView({ fridge_temp_f: 35, fridge_temp_at: new Date(Date.now() - 31 * 864e5) });
  assert.equal(old.recheckDue, true, 'monthly re-check');
  assert.equal(tempView({ fridge_temp_f: 31, fridge_temp_at: new Date() }).status, 'freezing');
  assert.equal(tempView({ fridge_temp_f: 33, fridge_temp_at: new Date() }).status, 'cold');
  assert.equal(tempView({ fridge_temp_f: 39, fridge_temp_at: new Date() }).status, 'warm');
  assert.equal(tempView({}).never, true);
});

test('household comparison shows only after 10 logged outcomes', () => {
  const at = (d) => `${d}T15:00:00Z`;
  const rows = Array.from({ length: 9 }, (_, i) => ({ produce: 'Apple', qty: 1, state: i < 2 ? 'tossed' : 'used', state_at: at('2026-11-02') }));
  let im = buildImpact(rows, { today: '2026-11-05', tz: 'UTC' });
  assert.equal(im.compare.ready, false);
  im = buildImpact([...rows, { produce: 'Apple', qty: 1, state: 'used', state_at: at('2026-11-03') }], { today: '2026-11-05', tz: 'UTC' });
  assert.equal(im.compare.ready, true);
  assert.equal(im.compare.outcomes, 10);
  assert.equal(im.compare.tossedShare, 0.2, '2 of 10 apples, by weight');
  assert.equal(im.compare.url, 'https://primary.ers.usda.gov/data-products/food-availability-per-capita-data-system/loss-adjusted-food-availability-documentation');
});

test('pilot cohorts: admin sets them, logging-only cohorts lose the nudges, scorecard splits by cohort', async () => {
  const A = (body) => api('/api/crisper/admin', { method: 'POST', body });
  assert.equal((await A({ key: 'nope', email: 'drew.test@gmail.com', cohort: 'holdout' })).status, 403);
  assert.equal((await A({ key: 'dev-admin', email: 'drew.test@gmail.com', cohort: 'treatment' })).status, 400);
  assert.equal((await A({ key: 'dev-admin', email: 'nobody@example.com', cohort: 'full' })).status, 404);
  let a = await A({ key: 'dev-admin', email: 'Drew.Test@gmail.com', cohort: 'holdout' });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(a.data.user.cohort, 'holdout');

  let me = (await api('/api/crisper/me', { key })).data;
  assert.equal(me.pilot.cohort, 'holdout');
  assert.ok(Object.values(me.features).every((f) => f === false), 'holdout: logging only');
  assert.equal(me.rescue, null); assert.equal(me.shopping, null); assert.equal(me.impact.compare, null); assert.equal(me.impact.rescue, null);
  assert.ok(me.items.every((i) => !i.rescueOptions));
  // Logging still works, without the fix.
  const it = me.items[me.items.length - 1];
  await P({ id: it.id, op: 'tossed' });
  let r = await P({ id: it.id, op: 'reason', reason: 'forgot' });
  assert.equal(r.data.last.reason, 'forgot'); assert.equal(r.data.last.fix, null);

  const adm = (await api('/api/crisper/admin?key=dev-admin')).data;
  const hold = adm.pilot.find((p) => p.period === 'holdout');
  assert.equal(hold.members, 1);
  assert.equal(hold.outcomes, 1, 'only outcomes after joining count');
  assert.equal(hold.tossedShareCount, 1); assert.equal(hold.reasons.forgot, 1);
  assert.equal(adm.users[0].cohort, 'holdout');
  assert.ok(adm.pilot.find((p) => p.period === 'not in a pilot'));

  a = await A({ key: 'dev-admin', email: 'drew.test@gmail.com', cohort: 'baseline' });
  me = (await api('/api/crisper/me', { key })).data;
  assert.equal(me.pilot.phase, 'baseline');
  assert.equal(me.features.rescue, false);
  const days = (Date.parse(me.pilot.featuresOnAt) - Date.parse(a.data.user.cohortAt)) / 864e5;
  assert.equal(Math.round(days), 14);
  // After 14 days a baseline user gets everything.
  const later = pilotFor({ cohort: 'baseline', cohort_at: new Date(Date.now() - 15 * 864e5) });
  assert.equal(later.phase, 'full'); assert.equal(later.features.rescue, true);
  assert.equal(periodFor({ cohort: 'baseline', cohort_at: new Date(Date.now() - 15 * 864e5) }, new Date()), 'baseline (features on)');
  assert.equal(periodFor({ cohort: 'baseline', cohort_at: new Date(Date.now() - 15 * 864e5) }, new Date(Date.now() - 10 * 864e5)), 'baseline (first 14 days)');
  assert.equal(pilotFor({ cohort: 'full' }).features.compare, true);

  a = await A({ key: 'dev-admin', email: 'drew.test@gmail.com', cohort: null });
  assert.equal(a.data.user.cohort, null);
  me = (await api('/api/crisper/me', { key })).data;
  assert.equal(me.pilot.cohort, null);
  assert.ok(Object.values(me.features).every(Boolean), 'out of the pilot: everything back on');
});

test('store newsletters are ignored, real orders still count', async () => {
  const { parseEmail } = await import('../api/_crisper/parser.js');
  const promo = parseEmail({ from: 'Walmart <news@walmart.com>', subject: 'Fresh deals: avocados 2 for $5, strawberries $2.98', text: 'Shop this week\nAvocados 2 for $5\nStrawberries 1 lb $2.98\nBananas 58 cents/lb\nShop now. Unsubscribe', requireOrder: true });
  assert.equal(promo.type, 'promo');
  const amazonBook = parseEmail({ from: 'Amazon <shipment-tracking@amazon.com>', subject: 'Your Amazon.com order has shipped', text: 'Order #112-3344556-7788990\nThe Hobbit (Paperback)\nQty: 1', requireOrder: true });
  assert.equal(amazonBook.type, 'order');
  assert.equal(amazonBook.items.length, 0);
  const paste = parseEmail({ text: 'Bananas 2.1 lb 1.23\nStrawberries 1 lb 2.98' });
  assert.equal(paste.type, 'order');
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
