// Double Krisp ownership + refill subscription status from Klaviyo data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.mjs';
import { summarizeShop, setShopReader, DOUBLE_KRISP_ID, REFILL_ID } from '../api/_crisper/shop.js';

const TODAY = '2026-11-05';

test('no orders: nothing owned, no subscription', () => {
  const s = summarizeShop({ orders: [], lifecycle: [] }, TODAY);
  assert.equal(s.found, false);
  assert.equal(s.doubleKrisp.owned, false);
  assert.equal(s.subscription.status, 'none');
});

test('one contract cancelled, another still renewing -> active, next date rolled forward', () => {
  const s = summarizeShop({
    orders: [
      { at: '2026-04-27T15:00:00Z', productId: DOUBLE_KRISP_ID, name: 'Double Krisp' },
      { at: '2026-09-26T15:00:00Z', productId: REFILL_ID, name: 'Refill Subscription' },
    ],
    lifecycle: [
      { at: '2026-04-27T15:00:00Z', kind: 'active', contract: 'A', nextOn: '2026-05-27', unit: 'MONTH', count: 1 },
      { at: '2026-05-02T15:00:00Z', kind: 'cancelled', contract: 'A' },
      { at: '2026-05-10T15:00:00Z', kind: 'active', contract: 'B', nextOn: '2026-06-10', unit: 'MONTH', count: 1, manageUrl: 'https://shop/manage' },
      { at: '2026-09-25T15:00:00Z', kind: 'active', contract: 'B', nextOn: '2026-09-26' },
    ],
  }, TODAY);
  assert.equal(s.doubleKrisp.owned, true);
  assert.equal(s.doubleKrisp.firstOrderedOn, '2026-04-27');
  assert.equal(s.subscription.status, 'active');
  assert.equal(s.subscription.nextOn, '2026-11-26');
  assert.equal(s.subscription.manageUrl, 'https://shop/manage');
  assert.equal(s.refills.lastOrderedOn, '2026-09-26');
});

test('paused and cancelled', () => {
  const paused = summarizeShop({ orders: [], lifecycle: [{ at: '2026-10-01T00:00:00Z', kind: 'active', contract: 'X' }, { at: '2026-10-20T00:00:00Z', kind: 'paused', contract: 'X' }] }, TODAY);
  assert.equal(paused.subscription.status, 'paused');
  assert.ok(paused.subscription.manageUrl);
  const cancelled = summarizeShop({ orders: [{ at: '2026-03-01T00:00:00Z', productId: DOUBLE_KRISP_ID }], lifecycle: [{ at: '2026-04-01T00:00:00Z', kind: 'cancelled', contract: 'X' }] }, TODAY);
  assert.equal(cancelled.subscription.status, 'cancelled');
  assert.equal(cancelled.doubleKrisp.owned, true);
});

test('stale active signal without recent billing is not claimed as active', () => {
  const s = summarizeShop({ orders: [], lifecycle: [{ at: '2026-06-01T00:00:00Z', kind: 'active', contract: 'X', nextOn: '2026-07-01' }] }, TODAY);
  assert.equal(s.subscription.status, 'unknown');
});

test('recent refill order alone counts as an active subscription', () => {
  const s = summarizeShop({ orders: [{ at: '2026-10-20T00:00:00Z', productId: REFILL_ID, name: 'Refill Subscription' }], lifecycle: [] }, TODAY);
  assert.equal(s.subscription.status, 'active');
  assert.equal(s.subscription.nextOn, '2026-11-20');
});

test('dashboard shows Double Krisp + subscription from orders and turns on "I have a Krisp" once', async () => {
  const shipped = new Date(Date.now() - 10 * 864e5).toISOString();
  setShopReader(async (email) => email === 'buyer@example.com'
    ? { orders: [{ at: shipped, productId: DOUBLE_KRISP_ID, name: 'Double Krisp' }], lifecycle: [{ at: shipped, kind: 'active', contract: 'C1', nextOn: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), unit: 'MONTH', count: 1 }] }
    : { orders: [], lifecycle: [] });
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const api = async (p, { method = 'GET', body, key } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-crisper-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  try {
    const su = await api('/api/crisper/signup', { method: 'POST', body: { email: 'buyer@example.com', tz: 'America/Denver' } });
    assert.equal(su.status, 200, JSON.stringify(su.data));
    const key = su.data.key;
    let me = (await api('/api/crisper/me', { key })).data;
    assert.equal(me.shop.checked, true);
    assert.equal(me.shop.ownsDoubleKrisp, true);
    assert.equal(me.shop.subscription.status, 'active');
    assert.equal(me.krisp.owned, true, 'auto-set from the order');
    assert.equal(me.krisp.changedOn, shipped.slice(0, 10), 'sachet date from the shipment');

    // Member says they don't use it: respect that on later refreshes.
    await api('/api/crisper/me', { method: 'POST', key, body: { settings: { hasKrisp: false } } });
    me = (await api('/api/crisper/me?refreshShop=1', { key })).data;
    assert.equal(me.krisp.owned, false);
    assert.equal(me.shop.ownsDoubleKrisp, true);

    // No orders: shop checked, nothing claimed.
    const other = await api('/api/crisper/signup', { method: 'POST', body: { email: 'nobody@example.com' } });
    me = (await api('/api/crisper/me', { key: other.data.key })).data;
    assert.equal(me.shop.ownsDoubleKrisp, false);
    assert.equal(me.krisp.owned, false);

    // Klaviyo down: falls back quietly.
    setShopReader(async () => { throw new Error('boom'); });
    const third = await api('/api/crisper/signup', { method: 'POST', body: { email: 'third@example.com' } });
    me = (await api('/api/crisper/me', { key: third.data.key })).data;
    assert.equal(me.shop.checked, false);
  } finally {
    setShopReader(null);
    server.close();
  }
});
