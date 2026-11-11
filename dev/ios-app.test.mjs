// iPhone app support: CORS for capacitor://localhost, push tokens, APNs JWT,
// reminder push text, universal-link file, Shopify sign-in back to the app,
// and the app's www build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import http2 from 'node:http2';
import { readFile } from 'node:fs/promises';
import { createServer } from './server.mjs';
import { handle } from '../api/_crisper/http.js';
import { q } from '../api/_crisper/db.js';
import { providerToken, apnsPayload, pushToUser, pushEnabled } from '../api/_crisper/push.js';
import { pushText } from '../api/crisper/cron.js';
import manifestHandler, { appSiteAssociation } from '../api/crisper/manifest.js';
import shopify from '../api/crisper/shopify.js';
import { transform } from '../app/scripts/build-www.mjs';

function fakeRes() {
  const headers = {};
  let done;
  const p = new Promise((r) => { done = r; });
  const res = {
    statusCode: 200, headersSent: false,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { done({ status: this.statusCode, headers, body: o }); return this; },
    end(b) { done({ status: this.statusCode, headers, body: b }); },
  };
  return { res, p };
}

test('CORS: app origins get preflight + headers, other origins do not', async () => {
  const h = handle(['POST'], async () => ({ ok: 1 }));
  let { res, p } = fakeRes();
  h({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } }, res);
  let r = await p;
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], 'capacitor://localhost');
  assert.match(r.headers['access-control-allow-headers'], /X-Crisper-Key/);

  ({ res, p } = fakeRes());
  h({ method: 'POST', headers: { origin: 'https://evil.example' }, body: {} }, res);
  r = await p;
  assert.equal(r.status, 200);
  assert.equal(r.headers['access-control-allow-origin'], undefined);

  ({ res, p } = fakeRes());
  h({ method: 'GET', headers: { origin: 'capacitor://localhost' } }, res);
  r = await p;
  assert.equal(r.status, 405, 'method rules still apply');
  assert.equal(r.headers['access-control-allow-origin'], 'capacitor://localhost');
});

test('push tokens: register, move between accounts, unregister, removed with the account', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const api = async (p, { body, key } = {}) => {
    const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-crisper-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  try {
    const a = (await api('/api/crisper/signup', { body: { email: 'push.a@example.com', tz: 'America/Denver' } })).data.key;
    const b = (await api('/api/crisper/signup', { body: { email: 'push.b@example.com', tz: 'America/Denver' } })).data.key;
    const tok = 'ab'.repeat(32);
    assert.equal((await api('/api/crisper/me', { key: a, body: { pushToken: 'not-hex!' } })).status, 400);
    assert.equal((await api('/api/crisper/me', { body: { pushToken: tok } })).status, 401);
    assert.deepEqual((await api('/api/crisper/me', { key: a, body: { pushToken: tok, pushEnv: 'development' } })).data, { ok: true, push: true });
    let rows = await q('SELECT d.env, u.email FROM crisper_devices d JOIN crisper_users u ON u.id = d.user_id WHERE token = $1', [tok]);
    assert.deepEqual(rows, [{ env: 'development', email: 'push.a@example.com' }]);
    // Same phone signs in to another account: the token follows.
    await api('/api/crisper/me', { key: b, body: { pushToken: tok } });
    rows = await q('SELECT d.env, u.email FROM crisper_devices d JOIN crisper_users u ON u.id = d.user_id WHERE token = $1', [tok]);
    assert.deepEqual(rows, [{ env: 'production', email: 'push.b@example.com' }]);
    // Sign out from the old account doesn't remove it from the new one.
    await api('/api/crisper/me', { key: a, body: { pushToken: tok, pushOff: true } });
    assert.equal((await q('SELECT 1 FROM crisper_devices WHERE token = $1', [tok])).length, 1);
    await api('/api/crisper/me', { key: b, body: { pushToken: tok, pushOff: true } });
    assert.equal((await q('SELECT 1 FROM crisper_devices WHERE token = $1', [tok])).length, 0);
    await api('/api/crisper/me', { key: b, body: { pushToken: tok } });
    await api('/api/crisper/me', { key: b, body: { deleteAccount: true } });
    assert.equal((await q('SELECT 1 FROM crisper_devices WHERE token = $1', [tok])).length, 0);
  } finally {
    server.close();
  }
});

test('APNs: off without env; provider token is a valid ES256 JWT', async () => {
  assert.equal(pushEnabled(), false);
  assert.deepEqual(await pushToUser('00000000-0000-0000-0000-000000000000', { title: 't', body: 'b' }), { sent: 0, failed: 0, devices: 0 });
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const env = { APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'), APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'TEAM123456' };
  const jwt = providerToken(1_800_000_000, env);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'ABC123DEFG' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { iss: 'TEAM123456', iat: 1_800_000_000 });
  assert.ok(cryptoVerify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  assert.equal(providerToken(1_800_000_000 + 600, env), jwt, 'reused within 40 minutes');
  assert.deepEqual(apnsPayload({ title: 'Eat these first', body: 'x', path: '#check' }), { aps: { alert: { title: 'Eat these first', body: 'x' }, sound: 'default', 'thread-id': 'krisper' }, path: '#check' });
});

test('APNs send: right headers and body, dead tokens are dropped', async () => {
  const seen = [];
  const apns = http2.createServer();
  apns.on('stream', (stream, headers) => {
    let body = '';
    stream.on('data', (c) => { body += c; });
    stream.on('end', () => {
      seen.push({ headers, body: JSON.parse(body) });
      const dead = headers[':path'].endsWith('dd'.repeat(32));
      stream.respond({ ':status': dead ? 410 : 200 });
      stream.end(dead ? JSON.stringify({ reason: 'Unregistered' }) : '');
    });
  });
  await new Promise((r) => apns.listen(0, r));
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  Object.assign(process.env, { APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), APNS_KEY_ID: 'KEYID12345', APNS_TEAM_ID: 'TEAM123456', APNS_HOST_OVERRIDE: `http://localhost:${apns.address().port}` });
  try {
    const [u] = await q(`INSERT INTO crisper_users (email, key_hash, inbox_slug) VALUES ('apns@example.com', 'kh-apns', 'apnsslug01') RETURNING id`);
    await q(`INSERT INTO crisper_devices (token, user_id) VALUES ($1, $3), ($2, $3)`, ['cc'.repeat(32), 'dd'.repeat(32), u.id]);
    const r = await pushToUser(u.id, { title: 'Eat these first', body: 'kale needs to be used soon.' }, { collapseId: 'use-2026-11-11' });
    assert.deepEqual(r, { sent: 1, failed: 1, devices: 2 });
    assert.equal(seen.length, 2);
    const h = seen[0].headers;
    assert.equal(h['apns-topic'], 'com.simplykrisp.krisper');
    assert.equal(h['apns-push-type'], 'alert');
    assert.equal(h['apns-collapse-id'], 'use-2026-11-11');
    assert.match(h.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(seen[0].body.aps.alert.title, 'Eat these first');
    const left = await q('SELECT token FROM crisper_devices WHERE user_id = $1', [u.id]);
    assert.deepEqual(left.map((x) => x.token), ['cc'.repeat(32)]);
  } finally {
    for (const k of ['APNS_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_HOST_OVERRIDE']) delete process.env[k];
    apns.close();
  }
});

test('reminder push text', () => {
  assert.deepEqual(pushText('use', { reminder_type: 'use_soon', count: 2, item_names: 'spinach and strawberries' }), { title: 'Eat these first', body: 'spinach and strawberries need to be used soon.', path: '' });
  assert.equal(pushText('use', { reminder_type: 'use_soon', count: 1, item_names: 'kale' }).body, 'kale needs to be used soon.');
  assert.equal(pushText('shop', { have_count: 3, use_first_names: 'kale' }).body, 'You still have 3 items in the fridge. Use kale first.');
  assert.equal(pushText('shop', {}).path, '#check');
  assert.match(pushText('krisp', { due_in_days: 2 }).body, /in 2 days/);
  assert.match(pushText('krisp', { due_in_days: -3 }).body, /now/);
});

test('apple-app-site-association: Team ID from env, admin excluded, served via rewrite', async () => {
  const a = appSiteAssociation({ APNS_TEAM_ID: 'TEAM123456' });
  assert.deepEqual(a.applinks.details[0].appIDs, ['TEAM123456.com.simplykrisp.krisper']);
  assert.deepEqual(a.applinks.details[0].components[0], { '/': '/krisper/admin*', exclude: true });
  const { res, p } = fakeRes();
  manifestHandler({ url: '/api/crisper/manifest?aasa=1', query: { aasa: '1' } }, res);
  const r = await p;
  assert.equal(r.headers['content-type'], 'application/json');
  assert.ok(JSON.parse(r.body).applinks);
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercel.rewrites[0], { source: '/.well-known/apple-app-site-association', destination: '/api/crisper/manifest?aasa=1' });
});

test('Shopify sign-in started from the app returns to simplykrisp://', async () => {
  delete process.env.SHOPIFY_CA_CLIENT_ID;
  const { res, p } = fakeRes();
  shopify({ method: 'GET', query: { app: '1' }, headers: {} }, res);
  assert.equal((await p).headers.location, 'simplykrisp://krisper?signin=unavailable');
  const w = fakeRes();
  shopify({ method: 'GET', query: {}, headers: {} }, w.res);
  assert.match((await w.p).headers.location, /^http.*\/krisper\?signin=unavailable$/);
  const o = fakeRes();
  shopify({ method: 'OPTIONS', query: {}, headers: { origin: 'capacitor://localhost' } }, o.res);
  assert.equal((await o.p).status, 204);
});

test('app www build: native globals, no manifest, website links absolute, native.js last', async () => {
  const html = await readFile(new URL('../crisper/index.html', import.meta.url), 'utf8');
  const out = transform(html, { api: 'https://guide.simplykrisp.com', site: 'https://guide.simplykrisp.com', pushEnv: 'production' });
  assert.match(out, /window\.KRISPER_NATIVE=true;window\.CRISPER_API="https:\/\/guide\.simplykrisp\.com"/);
  assert.match(out, /viewport-fit=cover/);
  assert.ok(!/<link rel="manifest"/.test(out));
  assert.ok(!/href="\/(seasonal|lab)"/.test(out));
  assert.match(out, /<script src="native\.js"><\/script>\n<\/body>/);
  assert.ok(out.indexOf('native.js') > out.lastIndexOf('boot();'));
});
