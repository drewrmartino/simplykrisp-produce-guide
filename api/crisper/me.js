// GET  /api/crisper/me            (header X-Crisper-Key) -> dashboard state
// POST /api/crisper/me {settings}  -> update settings, returns state
// POST /api/crisper/me {deleteAccount: true} -> removes the account and all data

import { handle, bad } from '../_crisper/http.js';
import { requireUser, buildState, refreshShop } from '../_crisper/core.js';
import { q, one, logEvent } from '../_crisper/db.js';

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
