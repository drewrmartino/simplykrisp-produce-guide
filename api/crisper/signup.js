// POST /api/crisper/signup
//   { email, firstName, tz, hasKrisp, krispChangedOn, marketingConsent, source }
//     -> new account: { key, dashboardUrl, state }
//     -> existing email: { exists: true, emailed } (link re-sent via Klaviyo)
//   { email, resend: true } -> { ok: true } (always generic; never reveals accounts)

import { handle, bad } from '../_crisper/http.js';
import { createUser, cleanEmail, buildState, dashboardUrl, inboxAddress } from '../_crisper/core.js';
import { one, logEvent } from '../_crisper/db.js';
import { trackEvent, subscribeToList, klaviyoEnabled } from '../_crisper/klaviyo.js';

async function sendLink(user) {
  await trackEvent({
    email: user.email,
    firstName: user.first_name,
    metric: 'Crisper Link Requested',
    properties: { dashboard_url: dashboardUrl(user.id) },
  });
  await logEvent(user.id, 'link_requested');
}

export default handle(['POST'], async (req) => {
  const b = req.body;
  const email = cleanEmail(b.email);
  if (!email) throw bad('Enter a valid email address.');

  if (b.resend) {
    const user = await one('SELECT * FROM crisper_users WHERE email = $1', [email]);
    if (user) await sendLink(user);
    return { ok: true, emailed: klaviyoEnabled() };
  }

  const firstName = String(b.firstName || '').trim().slice(0, 60) || null;
  const krispChangedOn = /^\d{4}-\d{2}-\d{2}$/.test(b.krispChangedOn || '') ? b.krispChangedOn : null;
  const result = await createUser({
    email,
    firstName,
    tz: b.tz,
    hasKrisp: !!b.hasKrisp,
    krispChangedOn,
    marketingConsent: !!b.marketingConsent,
    source: String(b.source || '').slice(0, 80) || null,
  });

  if (result.existing) {
    const user = await one('SELECT * FROM crisper_users WHERE email = $1', [email]);
    if (user) await sendLink(user);
    return { exists: true, emailed: klaviyoEnabled() };
  }

  const { user, key } = result;
  await trackEvent({
    email,
    firstName,
    metric: 'Crisper Signed Up',
    uniqueId: `signup-${user.id}`,
    properties: {
      dashboard_url: dashboardUrl(user.id),
      forwarding_address: inboxAddress(user.inbox_slug) || '',
      has_krisp: !!b.hasKrisp,
    },
  });
  if (b.marketingConsent) await subscribeToList(email);

  return { key, dashboardUrl: dashboardUrl(user.id), state: await buildState(user) };
});
