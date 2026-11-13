// GET  /api/crisper/me            (header X-Crisper-Key) -> dashboard state
// POST /api/crisper/me {settings}  -> update settings, returns state
// POST /api/crisper/me {deleteAccount: true} -> removes the account and all data
// POST /api/crisper/me {pushToken, pushEnv?} -> registers this iPhone for push
// POST /api/crisper/me {pushToken, pushOff: true} -> unregisters it
// POST /api/crisper/me {feedback: {text, kind, page}} -> saved for the admin page and
//   emailed to the owner through the "Krisper Feedback" Klaviyo metric

import { handle, bad } from '../_crisper/http.js';
import { requireUser, buildState, refreshShop } from '../_crisper/core.js';
import { q, one, logEvent } from '../_crisper/db.js';
import { trackEvent } from '../_crisper/klaviyo.js';

const FEEDBACK_TO = process.env.CRISPER_FEEDBACK_EMAIL || 'drewrmartino@gmail.com';
const KINDS = new Set(['problem', 'idea', 'other']);

const PREFS = new Set(['smart', 'weekly', 'off']);

export default handle(['GET', 'POST'], async (req) => {
  let user = await requireUser(req);
  if (req.method === 'GET') {
    user = await refreshShop(user, { force: req.query?.refreshShop === '1' });
    return buildState(user);
  }

  const b = req.body;
  if (b.deleteAccount === true) {
    await q('DELETE FROM crisper_users WHERE id = $1', [user.id]);
    await logEvent(null, 'account_deleted');
    return { deleted: true };
  }

  if (b.pushToken) {
    const token = String(b.pushToken).trim();
    if (!/^[0-9a-fA-F]{32,200}$/.test(token)) throw bad('Bad push token.');
    if (b.pushOff === true) {
      await q('DELETE FROM crisper_devices WHERE token = $1 AND user_id = $2', [token, user.id]);
      return { ok: true, push: false };
    }
    const env = b.pushEnv === 'development' ? 'development' : 'production';
    await q(`INSERT INTO crisper_devices (token, user_id, env) VALUES ($1, $2, $3)
             ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, env = EXCLUDED.env, last_seen_at = now()`, [token, user.id, env]);
    await logEvent(user.id, 'push_registered', { env });
    return { ok: true, push: true };
  }

  if (b.feedback) {
    const text = String(b.feedback.text || '').trim().slice(0, 2000);
    if (text.length < 3) throw bad('Write a few words first.');
    const kind = KINDS.has(b.feedback.kind) ? b.feedback.kind : 'other';
    const page = String(b.feedback.page || '').slice(0, 40);
    const recent = await one(`SELECT count(*)::int AS n FROM crisper_events WHERE user_id = $1 AND type = 'feedback' AND at > now() - interval '1 day'`, [user.id]);
    if ((recent?.n || 0) >= 15) throw bad('Thanks, we have plenty from you today. Email info@simplykrisp.com for more.', 429);
    const ua = String(req.headers['user-agent'] || '').slice(0, 160);
    await logEvent(user.id, 'feedback', { text, kind, page, ua });
    await trackEvent({
      email: FEEDBACK_TO,
      metric: 'Krisper Feedback',
      properties: { from_email: user.email, from_name: user.first_name || '', kind, text, page, device: ua, admin_url: 'https://guide.simplykrisp.com/krisper/admin' },
    });
    return { ok: true };
  }

  const s = b.settings || {};
  const sets = [];
  const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if ('firstName' in s) add('first_name', String(s.firstName || '').trim().slice(0, 60) || null);
  if ('hasKrisp' in s) add('has_krisp', !!s.hasKrisp);
  if ('krispChangedOn' in s) {
    if (s.krispChangedOn && !/^\d{4}-\d{2}-\d{2}$/.test(s.krispChangedOn)) throw bad('Use a valid date.');
    add('krisp_changed_on', s.krispChangedOn || null);
  }
  if ('reminderPref' in s) {
    if (!PREFS.has(s.reminderPref)) throw bad('Unknown reminder setting.');
    add('reminder_pref', s.reminderPref);
  }
  if ('dismissGmailCode' in s) add('gmail_verification', null);
  if (sets.length) {
    vals.push(user.id);
    user = await one(`UPDATE crisper_users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    await logEvent(user.id, 'settings', Object.keys(s));
  }
  return buildState(user, { touch: false });
});
