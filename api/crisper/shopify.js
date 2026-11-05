// Sign in to My Krisper with the same Simply Krisp customer account used on
// simplykrisp.com (Shopify new customer accounts, OAuth 2.0 + PKCE + OIDC).
//
//   GET /api/crisper/shopify?check=1   -> { enabled }
//   GET /api/crisper/shopify           -> 302 to Shopify's sign-in page
//   GET /api/crisper/shopify?code=…    -> callback: verify, find/create the
//                                         Krisper for that email, 302 /krisper?k=…
//
// Env: SHOPIFY_CA_CLIENT_ID (Headless channel > Customer Account API, public
// client), optional SHOPIFY_STORE_DOMAIN (default simplykrisp.com).

import { createHmac, createHash, randomBytes, createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';
import { one, logEvent } from '../_crisper/db.js';
import { secret, keyFor, createUser, cleanEmail, siteOrigin, dashboardUrl, inboxAddress } from '../_crisper/core.js';
import { trackEvent } from '../_crisper/klaviyo.js';

const COOKIE = 'sk_oauth';
const clientId = () => process.env.SHOPIFY_CA_CLIENT_ID || '';
const store = () => (process.env.SHOPIFY_STORE_DOMAIN || 'simplykrisp.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const callbackUrl = () => `${siteOrigin()}/api/crisper/shopify`;
const b64u = (b) => Buffer.from(b).toString('base64url');

let oidcCache = null;
async function oidc() {
  if (oidcCache && oidcCache.at > Date.now() - 3600e3) return oidcCache.cfg;
  const r = await fetch(`https://${store()}/.well-known/openid-configuration`);
  if (!r.ok) throw new Error(`openid-configuration ${r.status}`);
  const cfg = await r.json();
  oidcCache = { at: Date.now(), cfg };
  return cfg;
}

function sign(s) { return createHmac('sha256', secret()).update(`sk-oauth:${s}`).digest('base64url'); }
function pack(obj) { const s = b64u(JSON.stringify(obj)); return `${s}.${sign(s)}`; }
function unpack(v) {
  const [s, sig] = String(v || '').split('.');
  if (!s || !sig) return null;
  const a = Buffer.from(sign(s)), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(s, 'base64url').toString()); } catch { return null; }
}
function readCookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/api/crisper/shopify; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
}
function redirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.setHeader('Cache-Control', 'no-store'); res.end(); }
function back(res, why) { redirect(res, `${siteOrigin()}/krisper?signin=${encodeURIComponent(why)}`); }

// Verify the RS256 ID token against the store's published keys.
export async function verifyIdToken(idToken, { cfg, aud, nonce, now = Date.now() / 1000, jwks = null }) {
  const [h, p, s] = String(idToken).split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url'));
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  if (header.alg !== 'RS256') throw new Error('alg');
  const keys = jwks || (await (await fetch(cfg.jwks_uri)).json()).keys;
  const jwk = keys.find((k) => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
  if (!jwk) throw new Error('kid');
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('signature');
  if (claims.iss !== cfg.issuer) throw new Error('iss');
  if (![].concat(claims.aud).includes(aud)) throw new Error('aud');
  if (!(claims.exp > now - 60)) throw new Error('exp');
  if (nonce && claims.nonce !== nonce) throw new Error('nonce');
  return claims;
}

// Find the Krisper for this email, or start one. Returns { key, created }.
export async function krisperForEmail(email, { firstName = null } = {}) {
  const existing = await one('SELECT * FROM crisper_users WHERE email = $1', [email]);
  if (existing) return { user: existing, key: keyFor(existing.id), created: false };
  const r = await createUser({ email, firstName, tz: null, hasKrisp: false, krispChangedOn: null, marketingConsent: false, source: 'shopify-login' });
  if (r.existing) { const u = await one('SELECT * FROM crisper_users WHERE email = $1', [email]); return { user: u, key: keyFor(u.id), created: false }; }
  await trackEvent({
    email, firstName, metric: 'Krisper Signed Up', uniqueId: `signup-${r.user.id}`,
    properties: { dashboard_url: dashboardUrl(r.user.id), forwarding_address: inboxAddress(r.user.inbox_slug) || '', has_krisp: false, source: 'shopify-login' },
  });
  return { user: r.user, key: r.key, created: true };
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  if (q.check) { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ enabled: !!clientId() }); }
  if (!clientId()) return back(res, 'unavailable');

  try {
    const cfg = await oidc();

    // Step 1: send the customer to Shopify's sign-in page.
    if (!q.code && !q.error) {
      const verifier = b64u(randomBytes(32));
      const state = b64u(randomBytes(16));
      const nonce = b64u(randomBytes(16));
      setCookie(res, pack({ state, verifier, nonce, t: Date.now() }), 600);
      const u = new URL(cfg.authorization_endpoint);
      u.searchParams.set('client_id', clientId());
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('redirect_uri', callbackUrl());
      u.searchParams.set('scope', 'openid email customer-account-api:full');
      u.searchParams.set('state', state);
      u.searchParams.set('nonce', nonce);
      u.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
      u.searchParams.set('code_challenge_method', 'S256');
      return redirect(res, u.toString());
    }

    // Step 2: callback.
    const saved = unpack(readCookie(req, COOKIE));
    setCookie(res, '', 0);
    if (q.error) return back(res, 'cancelled');
    if (!saved || saved.state !== q.state || Date.now() - saved.t > 600e3) return back(res, 'expired');

    const tr = await fetch(cfg.token_endpoint, {
      method: 'POST',
      // Public clients must send an Origin listed under JavaScript origin(s).
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SimplyKrisp-Krisper', Origin: siteOrigin() },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId(), redirect_uri: callbackUrl(), code: String(q.code), code_verifier: saved.verifier }),
    });
    const tok = await tr.json().catch(() => ({}));
    if (!tr.ok || !tok.id_token) { console.error('shopify token', tr.status, tok.error, tok.error_description); return back(res, 'failed'); }

    const claims = await verifyIdToken(tok.id_token, { cfg, aud: clientId(), nonce: saved.nonce });
    const email = cleanEmail(claims.email);
    if (!email) return back(res, 'noemail');

    // First name from the customer account, if we can get it (best effort).
    let firstName = null;
    try {
      const api = (await (await fetch(`https://${store()}/.well-known/customer-account-api`)).json()).graphql_api;
      const g = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: tok.access_token }, body: JSON.stringify({ query: '{ customer { firstName } }' }) });
      firstName = (await g.json())?.data?.customer?.firstName || null;
    } catch {}

    const { user, key, created } = await krisperForEmail(email, { firstName });
    await logEvent(user.id, 'shopify_login', { created });
    return redirect(res, `${siteOrigin()}/krisper?k=${key}`);
  } catch (e) {
    console.error('shopify login', e);
    return back(res, 'failed');
  }
}
