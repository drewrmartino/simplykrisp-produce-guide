// GET /api/crisper/admin?key=CRISPER_ADMIN_KEY — pilot scorecard.
// Answers the test's questions: do people finish setup, does email forwarding
// actually deliver orders, and do they keep using it?
// POST /api/crisper/admin { key, email, cohort: baseline|full|holdout|null }
//   puts a user in a pilot cohort (cohort_at = now) or takes them out (null).

import { handle, bad } from '../_crisper/http.js';
import { q, one, logEvent } from '../_crisper/db.js';
import { runReminders } from './cron.js';
import { readKlaviyo } from '../_crisper/shop.js';
import { cleanCohort, periodFor, COHORTS } from '../_crisper/pilot.js';
import { totals, tossedShare } from '../_crisper/impact.js';
import { TOSS_REASONS } from '../_crisper/rescue.js';

const PERIODS = ['not in a pilot', 'baseline (first 14 days)', 'baseline (features on)', 'full', 'holdout'];

// Per-cohort outcomes. Only items finished after the user joined their cohort
// count toward it; a baseline user's first 14 days and the days after are
// reported separately. Tossed share by count = average share tossed per
// finished item; by weight = the same estimate the user's ring uses.
async function pilotScorecard() {
  const members = await q(`SELECT COALESCE(cohort, 'none') AS cohort, count(*)::int AS n FROM crisper_users GROUP BY 1`);
  const byCohort = Object.fromEntries(members.map((m) => [m.cohort, m.n]));
  const rows = await q(`
    SELECT u.id AS user_id, u.cohort, u.cohort_at, i.produce, i.qty, i.weight, i.state, i.state_at, i.rescued, i.tossed_frac, i.trim, i.toss_reason
      FROM crisper_items i JOIN crisper_users u ON u.id = i.user_id
     WHERE i.state IN ('used','tossed') AND i.state_at IS NOT NULL
       AND (u.cohort IS NULL OR u.cohort_at IS NULL OR i.state_at >= u.cohort_at)`);
  const cards = await q(`
    SELECT u.cohort, u.cohort_at, e.at FROM crisper_events e JOIN crisper_users u ON u.id = e.user_id
     WHERE e.type IN ('item_used','item_finish','item_count') AND e.meta->>'via' = 'rescue_card'
       AND (u.cohort IS NULL OR u.cohort_at IS NULL OR e.at >= u.cohort_at)`);
  const groups = new Map(PERIODS.map((p) => [p, { rows: [], users: new Set(), cards: 0 }]));
  for (const r of rows) {
    const g = groups.get(periodFor(r, r.state_at));
    g.rows.push(r);
    g.users.add(r.user_id);
  }
  for (const c of cards) groups.get(periodFor(c, c.at)).cards += 1;
  return PERIODS.map((period) => {
    const g = groups.get(period);
    const t = totals(g.rows);
    const n = g.rows.length;
    const reasons = Object.fromEntries([...Object.keys(TOSS_REASONS), 'none'].map((k) => [k, 0]));
    for (const r of g.rows) if (tossedShare(r) > 0) reasons[r.toss_reason || 'none'] += 1;
    const key = period === 'not in a pilot' ? 'none' : period.split(' ')[0];
    return {
      period,
      members: byCohort[key] || 0,
      usersWithOutcomes: g.users.size,
      outcomes: n,
      tossed: t.tossedCount,
      partial: t.partialCount,
      tossedShareCount: n ? Math.round((g.rows.reduce((a, r) => a + tossedShare(r), 0) / n) * 1000) / 1000 : null,
      tossedShareWeight: n && t.eatenRate != null ? Math.round((1 - t.eatenRate) * 1000) / 1000 : null,
      rescues: t.rescued,
      rescueCardRescues: g.cards,
      reasons,
    };
  });
}

export default handle(['GET', 'POST'], async (req) => {
  const want = process.env.CRISPER_ADMIN_KEY;
  const given = req.method === 'POST' ? (req.body.key || req.query.key) : req.query.key;
  if (!want || given !== want) throw bad('Forbidden', 403);

  if (req.method === 'POST') {
    const cohort = cleanCohort(req.body.cohort);
    if (cohort === undefined) throw bad(`Cohort must be one of ${COHORTS.join(', ')} or none.`);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) throw bad('Which user? Send their email.');
    const u = await one(
      `UPDATE crisper_users SET cohort = $1, cohort_at = CASE WHEN $1::text IS NULL THEN NULL WHEN cohort IS DISTINCT FROM $1::text THEN now() ELSE cohort_at END
        WHERE lower(email) = $2 RETURNING id, email, cohort, cohort_at`,
      [cohort, email],
    );
    if (!u) throw bad('No user with that email.', 404);
    await logEvent(u.id, 'cohort_set', { cohort });
    return { ok: true, user: { email: u.email, cohort: u.cohort, cohortAt: u.cohort_at } };
  }

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
  const feedback = await q(`SELECT e.at, u.email, u.first_name, e.meta->>'kind' AS kind, e.meta->>'text' AS text, e.meta->>'page' AS page
    FROM crisper_events e LEFT JOIN crisper_users u ON u.id = e.user_id WHERE e.type = 'feedback' ORDER BY e.at DESC LIMIT 100`);
  const topProduce = await q(`SELECT produce, count(*)::int AS n,
      count(*) FILTER (WHERE state = 'tossed')::int AS tossed,
      count(*) FILTER (WHERE state = 'used')::int AS used
    FROM crisper_items WHERE state <> 'deleted' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  const users = await q(`
    SELECT u.email, u.first_name, u.created_at, u.last_seen_at, u.first_email_at, u.has_krisp, u.reminder_pref, u.cohort, u.cohort_at,
      (SELECT count(*)::int FROM crisper_items i WHERE i.user_id = u.id AND i.state <> 'deleted') AS items,
      (SELECT count(*)::int FROM crisper_receipts r WHERE r.user_id = u.id AND r.channel = 'email') AS emails
    FROM crisper_users u ORDER BY u.created_at DESC LIMIT 200`);
  // Can the Klaviyo key read orders? (needs profiles:read, events:read, metrics:read)
  let orderLookup;
  try { orderLookup = process.env.KLAVIYO_PRIVATE_KEY ? ((await readKlaviyo('info@simplykrisp.com')), 'working') : 'no KLAVIYO_PRIVATE_KEY'; }
  catch (e) { orderLookup = `not working (Klaviyo ${e.status || e.message}). The private key needs profiles:read, events:read and metrics:read.`; }
  const pilot = await pilotScorecard();
  const reasons = await q(`SELECT COALESCE(toss_reason, 'none') AS reason, count(*)::int AS n FROM crisper_items
    WHERE state = 'tossed' OR (state = 'used' AND tossed_frac > 0) GROUP BY 1 ORDER BY 2 DESC`);
  const reminderPreview = req.query.preview === '1' ? await runReminders({ dryRun: true }) : null;

  return { generatedAt: new Date().toISOString(), orderLookup, funnel, retention, sources, outcomes, receipts, unknownLines, feedback, topProduce, users, pilot, reasons, reminderPreview };
});
