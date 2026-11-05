// POST /api/crisper/receipt { text, preview? }
// Paste-a-receipt path: same parser as forwarded email. With preview: true it
// only returns what would be added, so the page can show it before saving.

import { handle, bad } from '../_crisper/http.js';
import { requireUser, buildState, applyOrder } from '../_crisper/core.js';
import { parseEmail } from '../_crisper/parser.js';

export default handle(['POST'], async (req) => {
  const user = await requireUser(req);
  const text = String(req.body.text || '');
  if (text.trim().length < 3) throw bad('Paste the text of a receipt or order email.');
  if (text.length > 100000) throw bad('That is too long — paste just the item list.');
  const parsed = parseEmail({ text, subject: '', from: '' });
  if (parsed.type !== 'order') throw bad('That looks like a setup email, not a receipt.');
  if (req.body.preview) return { preview: { retailer: parsed.retailer, items: parsed.items, skipped: parsed.skipped, unknown: parsed.unknown } };
  const result = await applyOrder(user, parsed, req.body.channel === 'photo' ? 'photo' : 'paste');
  return { result: { added: result.added }, state: await buildState(user, { touch: false }) };
});
