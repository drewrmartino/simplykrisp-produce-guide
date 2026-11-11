// Apple push notifications (APNs) for the iPhone app.
//
// Off until these Vercel env vars are set (all from the Apple Developer account):
//   APNS_KEY       contents of the AuthKey_XXXXXXXXXX.p8 file (newlines or \n are fine)
//   APNS_KEY_ID    the 10-character Key ID shown next to that key
//   APNS_TEAM_ID   the 10-character Team ID (Membership details)
//   APNS_BUNDLE_ID optional, default com.simplykrisp.krisper
//
// Uses token auth (a short-lived ES256 JWT) over HTTP/2, no extra packages.

import http2 from 'node:http2';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { q } from './db.js';

const HOSTS = { production: 'https://api.push.apple.com', development: 'https://api.sandbox.push.apple.com' };

export function pushEnabled() {
  return !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}
export const bundleId = () => process.env.APNS_BUNDLE_ID || 'com.simplykrisp.krisper';

let jwtCache = null;
export function providerToken(now = Math.floor(Date.now() / 1000), env = process.env) {
  // Apple wants the token refreshed between 20 and 60 minutes; reuse for 40.
  if (jwtCache && jwtCache.iat > now - 2400 && jwtCache.kid === env.APNS_KEY_ID) return jwtCache.jwt;
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64u({ alg: 'ES256', kid: env.APNS_KEY_ID });
  const body = b64u({ iss: env.APNS_TEAM_ID, iat: now });
  const key = createPrivateKey(String(env.APNS_KEY).replace(/\\n/g, '\n'));
  const sig = cryptoSign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jwtCache = { iat: now, kid: env.APNS_KEY_ID, jwt: `${head}.${body}.${sig}` };
  return jwtCache.jwt;
}

// The notification body Apple receives. `path` is opened inside the app on tap.
export function apnsPayload({ title, body, path = '', badge, threadId = 'krisper' }) {
  const aps = { alert: { title, body }, sound: 'default', 'thread-id': threadId };
  if (badge != null) aps.badge = badge;
  return { aps, path };
}

function sendOne(session, token, payload, { collapseId } = {}) {
  return new Promise((resolve) => {
    const headers = {
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': bundleId(),
      'apns-push-type': 'alert',
      'apns-priority': '10',
    };
    if (collapseId) headers['apns-collapse-id'] = collapseId.slice(0, 64);
    const req = session.request(headers);
    let status = 0, data = '';
    req.setEncoding('utf8');
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      let reason = '';
      try { reason = JSON.parse(data || '{}').reason || ''; } catch {}
      resolve({ token, status, reason });
    });
    req.on('error', (e) => resolve({ token, status: 0, reason: e.message }));
    req.setTimeout(10000, () => { req.close(); resolve({ token, status: 0, reason: 'timeout' }); });
    req.end(JSON.stringify(payload));
  });
}

// Send to every device a user has. Drops tokens Apple says are dead.
// Returns { sent, failed, devices }.
export async function pushToUser(userId, message, opts = {}) {
  const out = { sent: 0, failed: 0, devices: 0 };
  if (!pushEnabled()) return out;
  const devices = await q('SELECT token, env FROM crisper_devices WHERE user_id = $1', [userId]);
  out.devices = devices.length;
  if (!devices.length) return out;
  const payload = apnsPayload(message);
  const byEnv = {};
  for (const d of devices) (byEnv[d.env] ||= []).push(d.token);
  for (const [env, tokens] of Object.entries(byEnv)) {
    const session = http2.connect(process.env.APNS_HOST_OVERRIDE || HOSTS[env] || HOSTS.production); // override is for tests
    session.on('error', () => {});
    try {
      const results = await Promise.all(tokens.map((t) => sendOne(session, t, payload, opts)));
      for (const r of results) {
        if (r.status === 200) out.sent++;
        else {
          out.failed++;
          if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') {
            await q('DELETE FROM crisper_devices WHERE token = $1', [r.token]);
          } else console.error('apns', r.status, r.reason);
        }
      }
    } finally {
      session.close();
    }
  }
  return out;
}
