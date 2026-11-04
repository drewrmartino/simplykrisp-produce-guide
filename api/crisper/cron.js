// GET /api/crisper/cron — runs daily from vercel.json (14:00 UTC ≈ 7–8am Mountain).
//
// For each tester with reminders on:
//   smart  (default): email when something enters "use today / next 2 days",
//                     at most once a day, and not again for the same set of
//                     items within 3 days.
//   weekly:           one summary on Sunday (tester's time zone).
//   off:              nothing.
// Also flags the Krisp sachet when it's due (day 28) or overdue (day 30+).
// Emails are sent by Klaviyo flows listening for the events emitted here.

import { handle, bad } from '../_crisper/http.js';
import { q, logEvent } from '../_crisper/db.js';
import { itemView, sortViews, todayIn, krispStatus } from '../_crisper/shelf.js';
import { dashboardUrl, listNames } from '../_crisper/core.js';
import { trackEvent } from '../_crisper/klaviyo.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== 'production';
  return req.headers.authorization === `Bearer ${secret}` || req.query.secret === secret;
}

function weekday(tz) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date());
  } catch {
    return new Date().toUTCString().slice(0, 3);
  }
}

export async function runReminders({ dryRun = false } = {}) {
  // Go live: confirmed orders whose assumed delivery day has arrived.
  await q(`UPDATE crisper_items i SET state = 'active', state_at = now()
             FROM crisper_users u WHERE i.user_id = u.id AND i.state = 'pending'
              AND i.start_date <= (now() AT TIME ZONE u.tz)::date`);

  const users = await q(`SELECT * FROM crisper_users WHERE reminder_pref <> 'off'`);
  const summary = { users: users.length, sent: 0, krisp: 0, skipped: 0, details: [] };

  for (const user of users) {
    const today = todayIn(user.tz);
    const rows = await q(`SELECT * FROM crisper_items WHERE user_id = $1 AND state = 'active'`, [user.id]);
    const views = sortViews(rows.map((r) => itemView(r, user, today)).filter(Boolean));
    // "check" items are included for two days past their window, then dropped so
    // a forgotten item doesn't nag forever.
    const due = views.filter((v) => v.status === 'today' || v.status === 'soon' || (v.status === 'check' && v.leftMax >= -2));
    const krisp = krispStatus(user, today);
    const krispDue = krisp.owned && krisp.dueInDays != null && (krisp.dueInDays === 2 || krisp.dueInDays === 0 || krisp.dueInDays === -3);

    const lastAt = user.last_reminder_at ? new Date(user.last_reminder_at) : null;
    const hoursSince = lastAt ? (Date.now() - lastAt.getTime()) / 3600000 : Infinity;
    const dueKey = due.map((v) => v.id).sort().join(',');

    let send = false;
    let reason = '';
    if (user.reminder_pref === 'weekly') {
      send = weekday(user.tz) === 'Sun' && views.length > 0 && hoursSince > 20;
      reason = 'weekly';
    } else if (due.length) {
      const sameSet = dueKey === (user.last_reminder_items || '');
      send = hoursSince > 20 && (!sameSet || hoursSince > 72);
      reason = sameSet ? 'repeat-after-3-days' : 'new-items-due';
    }

    const list = user.reminder_pref === 'weekly' ? views.slice(0, 12) : due.slice(0, 8);
    const props = {
      first_name: user.first_name || '',
      reminder_type: user.reminder_pref === 'weekly' ? 'weekly' : 'use_soon',
      count: list.length,
      item_names: listNames(list.map((v) => v.name)),
      items: list.map((v) => ({ name: v.name, label: v.label, status: v.status, image: String(v.imageUrl || '').startsWith('http') ? v.imageUrl : '', tip: v.tip })),
      also_tracking: Math.max(0, views.length - list.length),
      dashboard_url: dashboardUrl(user.id),
      krisp_due_in_days: krisp.owned ? krisp.dueInDays : null,
    };

    if (send && list.length) {
      if (!dryRun) {
        await trackEvent({ email: user.email, firstName: user.first_name, metric: 'Krisper Use Soon', properties: props, uniqueId: `use-soon-${user.id}-${today}` });
        await q('UPDATE crisper_users SET last_reminder_at = now(), last_reminder_items = $1 WHERE id = $2', [dueKey, user.id]);
        await logEvent(user.id, 'reminder_sent', { count: list.length, reason });
      }
      summary.sent++;
      summary.details.push({ email: user.email, reason, items: props.item_names });
    } else {
      summary.skipped++;
    }

    if (krispDue) {
      if (!dryRun) {
        await trackEvent({
          email: user.email,
          firstName: user.first_name,
          metric: 'Krisper Krisp Change Due',
          uniqueId: `krisp-${user.id}-${today}`,
          properties: { first_name: user.first_name || '', due_in_days: krisp.dueInDays, changed_on: krisp.changedOn, dashboard_url: dashboardUrl(user.id) },
        });
        await logEvent(user.id, 'krisp_reminder', { dueInDays: krisp.dueInDays });
      }
      summary.krisp++;
    }
  }
  return summary;
}

export default handle(['GET', 'POST'], async (req) => {
  if (!authorized(req)) throw bad('Forbidden', 403);
  return runReminders({ dryRun: req.query.dry === '1' });
});
