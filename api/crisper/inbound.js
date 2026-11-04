// POST /api/crisper/inbound?token=…   — Postmark inbound webhook.
//
// Each tester forwards grocery emails to their personal address
// (<postmark-hash>+<slug>@inbound.postmarkapp.com). Postmark parses the email
// and POSTs it here as JSON. We find the tester by <slug>, read the produce out
// of the email, and keep only the result — the email itself is never stored.
//
// Always answers 200 for well-formed requests (even "unknown address") so
// Postmark doesn't retry mail we will never be able to place.

import { timingSafeEqual } from 'node:crypto';
import { handle, bad } from '../_crisper/http.js';
import { applyOrder } from '../_crisper/core.js';
import { parseEmail } from '../_crisper/parser.js';
import { q, one, logEvent } from '../_crisper/db.js';

function tokenOk(given) {
  const want = process.env.CRISPER_INBOUND_TOKEN;
  if (!want) return process.env.VERCEL_ENV !== 'production'; // local/preview testing only
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const SLUG_RE = /\+([a-hj-km-np-z2-9]{10})@/i;

export function findSlug(p) {
  const candidates = [
    p.MailboxHash && `x+${p.MailboxHash}@`,
    p.OriginalRecipient,
    ...(p.ToFull || []).map((t) => (t.MailboxHash ? `x+${t.MailboxHash}@` : t.Email)),
    ...(p.CcFull || []).map((t) => t.Email),
    ...(p.BccFull || []).map((t) => t.Email),
    p.To,
    ...(p.Headers || []).filter((h) => /^(x-forwarded-to|delivered-to|x-original-to|envelope-to)$/i.test(h.Name)).map((h) => h.Value),
  ].filter(Boolean);
  for (const c of candidates) {
    const m = String(c).match(SLUG_RE);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export default handle(['POST'], async (req) => {
  if (!tokenOk(req.query.token)) throw bad('Forbidden', 403);
  const p = req.body || {};
  if (!p.From && !p.FromFull && !p.TextBody && !p.HtmlBody) throw bad('Not a Postmark inbound payload');

  const slug = findSlug(p);
  if (!slug) return { ok: true, ignored: 'no recipient slug' };
  const user = await one('SELECT * FROM crisper_users WHERE inbox_slug = $1', [slug]);
  if (!user) return { ok: true, ignored: 'unknown recipient' };

  const from = p.FromFull?.Email ? `${p.FromFull.Name || ''} <${p.FromFull.Email}>` : p.From || '';
  const parsed = parseEmail({ from, subject: p.Subject || '', text: p.TextBody || '', html: p.HtmlBody || '' });

  if (parsed.type === 'gmail_verification') {
    await q('UPDATE crisper_users SET gmail_verification = $1::jsonb WHERE id = $2', [
      JSON.stringify({ ...parsed.verification, receivedAt: new Date().toISOString() }),
      user.id,
    ]);
    await logEvent(user.id, 'gmail_verification');
    return { ok: true, type: 'gmail_verification' };
  }
  if (parsed.type === 'setup_message') {
    await logEvent(user.id, 'setup_message', { subject: String(p.Subject || '').slice(0, 120) });
    return { ok: true, type: 'setup_message' };
  }

  await q('UPDATE crisper_users SET first_email_at = COALESCE(first_email_at, now()) WHERE id = $1', [user.id]);
  const result = await applyOrder(user, parsed, 'email');
  return { ok: true, type: 'order', retailer: parsed.retailer, kind: parsed.kind, added: result.added, duplicate: !!result.duplicate };
});
