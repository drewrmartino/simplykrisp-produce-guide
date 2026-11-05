// GET /api/crisper/admin?key=CRISPER_ADMIN_KEY — pilot scorecard.
// Answers the test's questions: do people finish setup, does email forwarding
// actually deliver orders, and do they keep using it?

import { handle, bad } from '../_crisper/http.js';
import { q, one } from '../_crisper/db.js';
import { runReminders } from './cron.js';
import { readKlaviyo } from '../_crisper/shop.js';

export default handle(['GET'], async (req) => {
  const want = process.env.CRISPER_ADMIN_KEY;
  if (!want || req.query.key !== want) throw bad('Forbidden', 403);

  const funnel = await one(`
    SELECT
      count(*)::int AS signups,
      count(*) FILTER (WHERE gmail_verification IS NOT NULL OR first_email_at IS NOT NULL)::int AS started_forwarding,
      count(*) FILTER (WHERE first_email_at IS NOT NULL)::int AS email_connected,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM crisper_items i WHERE i.user_id = u.id))::int AS tracked_any,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM crisper_items i WHERE i.user_id = u.id) AND (SELECT count(*) FROM crisper_items i WHERE i.user_id = u.id) >= 3)::int AS tracked_3plus,
      count(*) FILTER (WHERE last_seen_at > now() - interval '7 days')::int AS active_7d,
      count(*) FILTER (WHERE has_krisp)::int AS krisp_owners,
      count(*) FILTER (WHERE (shop_status->'doubleKrisp'->>'owned')::boolean)::int AS krisp_on_orders,
      count(*) FILTER (WHERE shop_status->'subscription'->>'status' = 'active')::int AS refills_active,
      count(*) FILTER (WHERE reminder_pref = 'off')::int AS reminders_off
    FROM crisper_users u`);

  const retention = await q(`
    SELECT
      date_trunc('week', u.created_at)::date AS cohort_week,
      count(*)::int AS signups,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM crisper_events e WHERE e.user_id = u.id AND e.type <> 'signup' AND e.at BETWEEN u.created_at + interval '7 days' AND u.created_at + interval '14 days'))::int AS active_week2,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM crisper_events e WHERE e.user_id = u.id AND e.type <> 'signup' AND e.at BETWEEN u.created_at + interval '35 days' AND u.created_at + interval '42 days'))::int AS active_week6
    FROM crisper_users u GROUP BY 1 ORDER BY 1`);

  const sources = await q(`SELECT source, count(*)::int AS items FROM crisper_items WHERE state <> 'deleted' GROUP BY 1 ORDER BY 2 DESC`);
  const outcomes = await q(`SELECT state, count(*)::int AS n FROM crisper_items GROUP BY 1 ORDER BY 2 DESC`);
  const receipts = await q(`SELECT channel, retailer, status, count(*)::int AS n FROM crisper_receipts GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 40`);
  const unknownLines = await q(`
    SELECT line, count(*)::int AS n FROM (
      SELECT jsonb_array_elements_text(unknown) AS line FROM crisper_receipts WHERE unknown IS NOT NULL
    ) t GROUP BY 1 ORDER BY 2 DESC LIMIT 30`);
  const topProduce = await q(`SELECT produce, count(*)::int AS n,
      count(*) FILTER (WHERE state = 'tossed')::int AS tossed,
      count(*) FILTER (WHERE state = 'used')::int AS used
    FROM crisper_items WHERE state <> 'deleted' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  const users = await q(`
    SELECT u.email, u.first_name, u.created_at, u.last_seen_at, u.first_email_at, u.has_krisp, u.reminder_pref,
      (SELECT count(*)::int FROM crisper_items i WHERE i.user_id = u.id AND i.state <> 'deleted') AS items,
      (SELECT count(*)::int FROM crisper_receipts r WHERE r.user_id = u.id AND r.channel = 'email') AS emails
    FROM crisper_users u ORDER BY u.created_at DESC LIMIT 200`);
  // Can the Klaviyo key read orders? (needs profiles:read, events:read, metrics:read)
  let orderLookup;
  try { orderLookup = process.env.KLAVIYO_PRIVATE_KEY ? ((await readKlaviyo('info@simplykrisp.com')), 'working') : 'no KLAVIYO_PRIVATE_KEY'; }
  catch (e) { orderLookup = `not working (Klaviyo ${e.status || e.message}). The private key needs profiles:read, events:read and metrics:read.`; }
  const reminderPreview = req.query.preview === '1' ? await runReminders({ dryRun: true }) : null;

  return { generatedAt: new Date().toISOString(), orderLookup, funnel, retention, sources, outcomes, receipts, unknownLines, topProduce, users, reminderPreview };
});
