// POST /api/crisper/items
//   { add: [{ produce, qty, date }] }         -> adds items by hand
//   { id, op: used|tossed|finish|trim|undo|delete|arrived|ripening|edit, days?, qty?, date?, portion?, trim? }
//   { check: true }                           -> weekly fridge check finished
//   { add: [...], source: 'repeat' }          -> "Same as last trip"
//   { shopDay: Fri|Sat|Sun|Mon|Thu|off }       -> before-you-shop email day
//   finish: portion = share of the edible part tossed (0, .25, .5, .75, 1); trim = trash|compost|used|null
// Returns fresh dashboard state.

import { handle, bad } from '../_crisper/http.js';
import { requireUser, buildState, addItem, itemAction } from '../_crisper/core.js';
import { logEvent, q } from '../_crisper/db.js';

const SHOP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'off'];

export default handle(['POST'], async (req) => {
  const user = await requireUser(req);
  const b = req.body;
  if (Array.isArray(b.add)) {
    if (!b.add.length || b.add.length > 40) throw bad('Add between 1 and 40 items at a time.');
    const source = b.source === 'repeat' ? 'repeat' : 'manual';
    for (const it of b.add) await addItem(user, { produce: it.produce, qty: it.qty, date: it.date, source });
    await logEvent(user.id, source === 'repeat' ? 'repeat_add' : 'manual_add', { count: b.add.length });
  } else if (b.check) {
    await q('UPDATE crisper_users SET last_check_at = now() WHERE id = $1', [user.id]);
    user.last_check_at = new Date().toISOString();
    await logEvent(user.id, 'fridge_check', { reviewed: Math.max(0, Math.min(200, parseInt(b.reviewed, 10) || 0)) });
  } else if (b.shopDay) {
    if (!SHOP_DAYS.includes(b.shopDay)) throw bad('Pick a day.');
    await q('UPDATE crisper_users SET shop_day = $1 WHERE id = $2', [b.shopDay, user.id]);
    user.shop_day = b.shopDay;
  } else if (b.id && b.op) {
    await itemAction(user, b);
  } else {
    throw bad('Nothing to do.');
  }
  return buildState(user, { touch: false });
});
