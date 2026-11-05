// "Sign in with your Simply Krisp account" (Shopify customer accounts, OIDC + PKCE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign, createHash } from 'node:crypto';
import './server.mjs'; // wires the in-memory database
import handler, { verifyIdToken } from '../api/crisper/shopify.js';
import { userFromKey } from '../api/_crisper/core.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const ISS = 'https://shopify.com/authentication/94453530943';
const cfg = { issuer: ISS, authorization_endpoint: 'https://account.simplykrisp.com/authentication/oauth/authorize', token_endpoint: 'https://account.simplykrisp.com/authentication/oauth/token', jwks_uri: 'https://account.simplykrisp.com/authentication/.well-known/jwks.json' };
const jwt = (claims, kid = 'k1') => {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url')}`;
};
const now = () => Math.floor(Date.now() / 1000);

test('ID token verification rejects bad signature, audience, issuer, nonce', async () => {
  const good = { iss: ISS, aud: 'cid', exp: now() + 300, nonce: 'n1', email: 'a@b.co' };
  assert.equal((await verifyIdToken(jwt(good), { cfg, aud: 'cid', nonce: 'n1', jwks: [jwk] })).email, 'a@b.co');
  await assert.rejects(verifyIdToken(jwt({ ...good, aud: 'other' }), { cfg, aud: 'cid', nonce: 'n1', jwks: [jwk] }), /aud/);
  await assert.rejects(verifyIdToken(jwt({ ...good, iss: 'https://evil' }), { cfg, aud: 'cid', nonce: 'n1', jwks: [jwk] }), /iss/);
  await assert.rejects(verifyIdToken(jwt(good), { cfg, aud: 'cid', nonce: 'n2', jwks: [jwk] }), /nonce/);
  await assert.rejects(verifyIdToken(jwt({ ...good, exp: now() - 600 }), { cfg, aud: 'cid', nonce: 'n1', jwks: [jwk] }), /exp/);
  const t = jwt(good).split('.'); t[1] = Buffer.from(JSON.stringify({ ...good, email: 'x@y.co' })).toString('base64url');
  await assert.rejects(verifyIdToken(t.join('.'), { cfg, aud: 'cid', nonce: 'n1', jwks: [jwk] }), /signature/);
});

function call(query, cookie) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, headers, body: o }); },
      end() { resolve({ status: this.statusCode, headers }); },
    };
    handler({ method: 'GET', query, headers: { cookie: cookie || '' } }, res);
  });
}

test('full sign-in: redirect with PKCE, callback creates then reuses the Krisper', async () => {
  process.env.SHOPIFY_CA_CLIENT_ID = 'cid';
  const realFetch = globalThis.fetch;
  let tokenBody = null, nonce = null;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const j = (o, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => o });
    if (u.endsWith('/.well-known/openid-configuration')) return j(cfg);
    if (u === cfg.jwks_uri) return j({ keys: [jwk] });
    if (u === cfg.token_endpoint) {
      tokenBody = new URLSearchParams(opts.body);
      return j({ access_token: 'at', id_token: jwt({ iss: ISS, aud: 'cid', exp: now() + 300, nonce, email: 'Shopper@Example.com', email_verified: true }) });
    }
    if (u.endsWith('/.well-known/customer-account-api')) return j({ graphql_api: 'https://account.simplykrisp.com/customer/api/2026-10/graphql' });
    if (u.includes('/customer/api/')) return j({ data: { customer: { firstName: 'Sam' } } });
    return realFetch(url, opts);
  };
  try {
    assert.deepEqual((await call({ check: '1' })).body, { enabled: true });
    for (let round = 0; round < 2; round++) {
      const a = await call({});
      assert.equal(a.status, 302);
      const loc = new URL(a.headers.location);
      assert.equal(loc.origin + loc.pathname, cfg.authorization_endpoint);
      assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
      assert.match(loc.searchParams.get('redirect_uri'), /\/api\/crisper\/shopify$/);
      nonce = loc.searchParams.get('nonce');
      const cookie = a.headers['set-cookie'].split(';')[0];
      // wrong state is refused
      assert.match((await call({ code: 'c', state: 'nope' }, cookie)).headers.location, /signin=expired/);
      const b = await call({ code: 'c', state: loc.searchParams.get('state') }, cookie);
      assert.equal(b.status, 302);
      assert.equal(createHash('sha256').update(tokenBody.get('code_verifier')).digest('base64url'), loc.searchParams.get('code_challenge'));
      const key = new URL(b.headers.location).searchParams.get('k');
      const user = await userFromKey(key);
      assert.equal(user.email, 'shopper@example.com');
      assert.equal(user.first_name, 'Sam');
      assert.ok(!b.headers.location.includes('#'));
    }
    assert.match((await call({ error: 'access_denied', state: 'x' }, '')).headers.location, /signin=cancelled/);
    delete process.env.SHOPIFY_CA_CLIENT_ID;
    assert.deepEqual((await call({ check: '1' })).body, { enabled: false });
  } finally { globalThis.fetch = realFetch; delete process.env.SHOPIFY_CA_CLIENT_ID; }
});
