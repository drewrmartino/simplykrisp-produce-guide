// POST /api/crisper/items
//   { add: [{ produce, qty, date }] }         -> adds items by hand
//   { id, op: used|tossed|finish|trim|undo|delete|arrived|ripening|edit, days?, qty?, date?, portion?, trim? }
//   finish: portion = share of the edible part tossed (0, .25, .5, .75, 1); trim = trash|compost|used|null
// Returns fresh dashboard state.

import { handle, bad } from '../_crisper/http.js';
import { requireUser, buildState, addItem, itemAction } from '../_crisper/core.js';
import { logEvent } from '../_crisper/db.js';

export default handle(['POST'], async (req) => {
  const user = await requireUser(req);
  const b = req.body;
  if (Array.isArray(b.add)) {
    if (!b.add.length || b.add.length > 40) throw bad('Add between 1 and 40 items at a time.');
    for (const it of b.add) await addItem(user, { produce: it.produce, qty: it.qty, date: it.date, source: 'manual' });
    await logEvent(user.id, 'manual_add', { count: b.add.length });
  } else if (b.id && b.op) {
    await itemAction(user, b);
  } else {
    throw bad('Nothing to do.');
  }
  return buildState(user, { touch: false });
});
