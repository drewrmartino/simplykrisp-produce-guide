// Klaviyo is the reminder engine: the API records events, and Klaviyo flows
// triggered by those metrics send the emails. That keeps all customer email on
// the store's existing sending domain and lets reminders be edited in Klaviyo
// without a deploy.
//
// Metrics this app emits (each becomes a flow trigger in Klaviyo):
//   Crisper Signed Up       — welcome + forwarding instructions + dashboard link
//   Crisper Link Requested  — "here's your dashboard link" (lost link)
//   Crisper Order Added     — optional confirmation that a receipt was read
//   Crisper Use Soon        — the reminder: what to eat first
//   Crisper Krisp Change Due — time to swap the sachet
//
// If KLAVIYO_PRIVATE_KEY is not set every call is a logged no-op, so the app
// still works end to end for testing without sending anything.

const API = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

export function klaviyoEnabled() {
  return !!process.env.KLAVIYO_PRIVATE_KEY;
}

async function call(path, body) {
  const key = process.env.KLAVIYO_PRIVATE_KEY;
  if (!key) {
    console.log('[klaviyo disabled]', path, JSON.stringify(body).slice(0, 300));
    return { skipped: true };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        revision: REVISION,
        accept: 'application/vnd.api+json',
        'content-type': 'application/vnd.api+json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('klaviyo error', path, res.status, text.slice(0, 500));
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('klaviyo request failed', path, e.message);
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export function trackEvent({ email, firstName, metric, properties = {}, uniqueId }) {
  const profile = { email };
  if (firstName) profile.first_name = firstName;
  return call('/events', {
    data: {
      type: 'event',
      attributes: {
        properties,
        metric: { data: { type: 'metric', attributes: { name: metric } } },
        profile: { data: { type: 'profile', attributes: profile } },
        ...(uniqueId ? { unique_id: uniqueId } : {}),
      },
    },
  });
}

// Only called when the tester ticks the marketing box at signup.
export function subscribeToList(email) {
  const listId = process.env.KLAVIYO_CRISPER_LIST_ID;
  if (!listId) return Promise.resolve({ skipped: true });
  return call('/profile-subscription-bulk-create-jobs', {
    data: {
      type: 'profile-subscription-bulk-create-job',
      attributes: {
        custom_source: 'Crisper Tracker signup',
        profiles: {
          data: [{ type: 'profile', attributes: { email, subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } } } }],
        },
      },
      relationships: { list: { data: { type: 'list', id: listId } } },
    },
  });
}
