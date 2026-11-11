// GET /api/crisper/cron — runs daily from vercel.json (14:00 UTC ≈ 7–8am Mountain).
//
// For each tester with reminders on:
//   smart  (default): email when something enters "use today / next 2 days",
//                     at most once a day, and not again for the same set of
//                     items within 3 days.
//   weekly:           one summary on Sunday (tester's time zone).
//   off:              nothing.
// Before you shop (weekly, on the tester's shop_day, default Friday): what is
// still in the fridge so they skip re-buying it, what to use first, and a link
// to the 1-minute fridge check. On that day it replaces the use-soon email.
// Also flags the Krisp sachet when it's due (day 28) or overdue (day 30+).
// Emails are sent by Klaviyo flows listening for the events emitted here.
// People using the iPhone app also get the same reminder as a push
// notification (api/_crisper/push.js; off until the APNS_* env vars are set).

import { handle, bad } from '../_crisper/http.js';
import { q, logEvent } from '../_crisper/db.js';
import { itemView, sortViews, todayIn, krispStatus } from '../_crisper/shelf.js';
import { dashboardUrl, listNames } from '../_crisper/core.js';
import { trackEvent } from '../_crisper/klaviyo.js';
import { pushToUser, pushEnabled } from '../_crisper/push.js';

// A push problem must never stop the emails, so failures are logged and skipped.
async function notify(summary, userId, message, opts) {
  if (!pushEnabled()) return;
  try {
    const r = await pushToUser(userId, message, opts);
    summary.push = (summary.push || 0) + r.sent;
  } catch (e) {
    console.error('push', e);
  }
}

export function pushText(kind, p) {
  if (kind === 'shop') {
    const bits = [];
    if (p.have_count) bits.push(`You still have ${p.have_count} item${p.have_count === 1 ? '' : 's'} in the fridge.`);
    if (p.use_first_names) bits.push(`Use ${p.use_first_names} first.`);
    return { title: 'Before you shop', body: bits.join(' ') || 'Check your fridge before you buy more.', path: '#check' };
  }
  if (kind === 'krisp') {
    const d = p.due_in_days;
    const when = d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : d === 0 ? 'today' : 'now';
    return { title: 'Krisp sachet', body: `Time to swap in a fresh Krisp sachet ${when}.`, path: '' };
  }
  if (p.reminder_type === 'weekly') return { title: 'Your week in the fridge', body: `${p.count} item${p.count === 1 ? '' : 's'} to use: ${p.item_names}.`, path: '' };
  return { title: 'Eat these first', body: `${p.item_names} ${p.count === 1 ? 'needs' : 'need'} to be used soon.`, path: '' };
}

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

    // ---- before you shop ----
    const shopDay = user.shop_day || 'Fri';
    const lastShop = user.last_shop_email_at ? (Date.now() - new Date(user.last_shop_email_at).getTime()) / 864e5 : Infinity;
    let shopSent = false;
    if (shopDay !== 'off' && weekday(user.tz) === shopDay && lastShop > 5) {
      const recentUsed = await q(
        `SELECT produce, count(*)::int AS n FROM crisper_items WHERE user_id = $1 AND state = 'used' AND state_at > now() - interval '28 days' GROUP BY produce ORDER BY n DESC`,
        [user.id],
      );
      const onHand = new Set(views.map((v) => v.name));
      const restock = recentUsed.map((r) => r.produce).filter((n) => !onHand.has(n)).slice(0, 6);
      if (views.length || restock.length) {
        const img = (v) => (String(v.imageUrl || '').startsWith('http') ? v.imageUrl : '');
        const skip = views.filter((v) => v.leftMax >= 3);
        const useFirst = views.filter((v) => v.leftMax < 3).slice(0, 6);
        const shopProps = {
          first_name: user.first_name || '',
          have_count: views.length,
          skip_names: listNames(skip.map((v) => v.name)),
          skip_items: skip.slice(0, 10).map((v) => ({ name: v.name, label: v.label, image: img(v) })),
          use_first_names: listNames(useFirst.map((v) => v.name)),
          use_first_items: useFirst.map((v) => ({ name: v.name, label: v.label, image: img(v) })),
          restock_names: listNames(restock),
          restock_count: restock.length,
          check_url: dashboardUrl(user.id) + '#check',
          dashboard_url: dashboardUrl(user.id),
        };
        if (!dryRun) {
          await trackEvent({ email: user.email, firstName: user.first_name, metric: 'Krisper Before You Shop', properties: shopProps, uniqueId: `shop-${user.id}-${today}` });
          await q('UPDATE crisper_users SET last_shop_email_at = now() WHERE id = $1', [user.id]);
          await logEvent(user.id, 'shop_email_sent', { have: views.length, restock: restock.length });
          await notify(summary, user.id, pushText('shop', shopProps), { collapseId: `shop-${today}` });
        }
        shopSent = true;
        summary.shop = (summary.shop || 0) + 1;
        summary.details.push({ email: user.email, reason: 'before-you-shop', skip: shopProps.skip_names, use_first: shopProps.use_first_names, restock: shopProps.restock_names });
      }
    }

    let send = false;
    let reason = '';
    if (shopSent) {
      send = false;
    } else if (user.reminder_pref === 'weekly') {
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
      // Same list under a name that can't collide with dict.items in Klaviyo templates.
      reminder_items: list.map((v) => ({ name: v.name, label: v.label, status: v.status, image: String(v.imageUrl || '').startsWith('http') ? v.imageUrl : '', tip: v.tip })),
      also_tracking: Math.max(0, views.length - list.length),
      dashboard_url: dashboardUrl(user.id),
      krisp_due_in_days: krisp.owned ? krisp.dueInDays : null,
    };

    if (send && list.length) {
      if (!dryRun) {
        await trackEvent({ email: user.email, firstName: user.first_name, metric: 'Krisper Use Soon', properties: props, uniqueId: `use-soon-${user.id}-${today}` });
        await q('UPDATE crisper_users SET last_reminder_at = now(), last_reminder_items = $1 WHERE id = $2', [dueKey, user.id]);
        await logEvent(user.id, 'reminder_sent', { count: list.length, reason });
        await notify(summary, user.id, pushText('use', props), { collapseId: `use-${today}` });
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
        await notify(summary, user.id, pushText('krisp', { due_in_days: krisp.dueInDays }), { collapseId: `krisp-${today}` });
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
