// Eat-it-all helpers: the "Rescue 1 item today" pick, rescue options for due
// items (cook / freeze / ferment), toss reasons and the fix shown after each,
// the crisper thermometer reading, and the Before-you-shop list.
//
// Food-safety rule for this file: say nothing we can't point to. Freeze and
// ferment advice is generic and links to the National Center for Home Food
// Preservation (NCHFP); the only per-item freeze notes are ones already in
// our own scrap ideas (scraps.js). Fridge numbers come from the FDA (40°F
// ceiling) and the 34-37°F produce range already in the research plan.

import { BY_NAME, zoneFor } from './shelf.js';
import { WHERE } from './storage.js';
import { scrapFor } from './scraps.js';
import { tossedShare } from './impact.js';
import { q } from './db.js';

export const LINKS = {
  blanching: 'https://nchfp.uga.edu/how/freeze/freeze-general-information/blanching-times/',
  freeze: 'https://nchfp.uga.edu/how/freeze',
  ferment: 'https://nchfp.uga.edu/how/ferment',
  pickle: 'https://nchfp.uga.edu/how/pickle/pickling-general-information/general-information-on-pickling',
  fda: 'https://www.fda.gov/consumers/consumer-updates/are-you-storing-food-safely',
};

// ---------- Rescue 1 item today ----------

// Due = in its last couple of days, or just past its usual window (up to two
// days over) where a look and a sniff may still save it. Views arrive sorted
// closest-to-going-bad first (sortViews), so the first due one is the pick.
export function isDue(v) {
  return v.status === 'today' || v.status === 'soon' || (v.status === 'check' && v.leftMax >= -2);
}
export function pickRescue(views) {
  return views.find(isDue) || null;
}

// ---------- Rescue options: cook, freeze, ferment ----------

// Salad greens are left out of "Freeze it" rather than making a claim about them.
const NO_FREEZE = new Set(['Lettuce', 'Bagged Salad', 'Arugula']);
// Vegetables NCHFP has tested pickling or fermenting recipes for.
const FERMENT = new Set(['Cabbage', 'Cucumber', 'Green Beans', 'Beet', 'Carrot', 'Cauliflower', 'Brussels Sprouts', 'Asparagus', 'Okra', 'Bell Pepper', 'Jalapeño', 'Zucchini']);
const FREEZE_IDEA = /^(freeze|slice and freeze|peel and freeze)\b/i;

export function rescueOptions(v) {
  const c = BY_NAME[v.name];
  if (!c) return null;
  const idea = (scrapFor(c.name)?.ideas || []).find((i) => FREEZE_IDEA.test(i)) || '';
  const veg = c.category === 'vegetable';
  const freeze = NO_FREEZE.has(c.name) ? null : {
    note: idea || (veg
      ? 'Most vegetables keep better frozen if they are blanched first. Look up the time for this one on the NCHFP blanching chart.'
      : 'Freeze it before it turns, for smoothies or baking. NCHFP has how-tos for freezing fruit.'),
    fromCatalog: !!idea,
    url: veg ? LINKS.blanching : LINKS.freeze,
    blanchingUrl: LINKS.blanching,
  };
  const ferment = FERMENT.has(c.name) ? {
    tip: 'Firm vegetables like this can be pickled or fermented. Use a tested recipe and follow its salt, vinegar and timing exactly.',
    url: LINKS.ferment,
    pickleUrl: LINKS.pickle,
  } : null;
  return { cook: { query: c.name.replace(/ \(.*\)$/, '').toLowerCase() }, freeze, ferment };
}

// ---------- Toss reasons and fixes ----------

export const TOSS_REASONS = {
  forgot: 'Forgot about it',
  spoiled: 'Spoiled early',
  too_much: 'Bought too much',
  disliked: "Didn't like it",
};
export function cleanReason(r) {
  if (r === null || r === '' || r === 'skip') return null;
  return Object.hasOwn(TOSS_REASONS, r) ? r : undefined;
}

// The fix shown right after a reason. views = the user's active item views.
export function fixFor(reason, produce, { user, views = [] }) {
  const c = BY_NAME[produce];
  const name = c?.name || produce;
  if (reason === 'forgot') {
    const zone = c ? zoneFor(c) : null;
    const similar = views
      .filter((v) => !v.eatFirst && (v.name === name || v.zone === zone))
      .slice(0, 6)
      .map((v) => ({ id: v.id, name: v.name, imageUrl: v.imageUrl, label: v.label }));
    return {
      reason,
      title: 'Keep it where you will see it',
      text: similar.length
        ? 'Move these to your Eat First zone so they are the first thing you see.'
        : 'Next time, flag anything you are likely to forget as Eat First so it sits at the top of your map.',
      similar,
      reminderPref: user.reminder_pref,
      remindersOn: user.reminder_pref !== 'off',
    };
  }
  if (reason === 'spoiled') {
    return {
      reason,
      title: `Storing ${name.toLowerCase()}`,
      where: c ? WHERE[c.storage] : '',
      tip: c?.tip || '',
      ripeTip: c?.ripeTip || '',
      text: 'Check your crisper is 34-37°F. A cheap fridge thermometer tells you for sure.',
      temp: tempView(user),
    };
  }
  if (reason === 'too_much') {
    return {
      reason,
      title: 'Noted for next time',
      text: `Your Before you shop list will suggest less ${name.toLowerCase()} next time.`,
    };
  }
  if (reason === 'disliked') {
    return {
      reason,
      title: 'Other ways to use it',
      text: `If ${name.toLowerCase()} comes home again, a recipe can change how it tastes.`,
      scrap: scrapFor(name),
      recipeQuery: name.replace(/ \(.*\)$/, '').toLowerCase(),
    };
  }
  return null;
}

// ---------- Crisper thermometer ----------

export const TEMP = { goodLow: 34, goodHigh: 37, fdaMax: 40, freeze: 32, recheckDays: 30, min: 20, max: 60 };

export function tempView(user, now = Date.now()) {
  if (user.fridge_temp_f == null) return { f: null, at: null, status: null, message: '', recheckDue: true, never: true };
  const f = Math.round(Number(user.fridge_temp_f) * 10) / 10;
  const status = f < TEMP.freeze ? 'freezing' : f < TEMP.goodLow ? 'cold' : f <= TEMP.goodHigh ? 'good' : f <= TEMP.fdaMax ? 'warm' : 'too_warm';
  const message = {
    freezing: 'Below 32°F, produce can freeze. Turn the fridge a little warmer and check again tomorrow.',
    cold: 'On the cold side. Aim for 34-37°F so delicate greens do not freeze.',
    good: 'Right in the 34-37°F range produce likes.',
    warm: 'Safe, but warmer than produce likes. Aim for 34-37°F.',
    too_warm: 'Above 40°F, the FDA upper limit for a fridge. Turn it colder and check again tomorrow.',
  }[status];
  const at = user.fridge_temp_at ? new Date(user.fridge_temp_at) : null;
  const ageDays = at ? Math.floor((now - at.getTime()) / 86400000) : null;
  return {
    f,
    at: at ? at.toISOString() : null,
    status,
    message,
    ageDays,
    recheckDue: ageDays == null || ageDays >= TEMP.recheckDays || status === 'too_warm' || status === 'freezing',
    never: false,
    fdaUrl: LINKS.fda,
  };
}

// ---------- Before you shop ----------

// Last two purchases of each item (top-level rows; split-off children carry
// the rest of the outcome), flagged "buy less" when the user tossed it for
// "Bought too much", or tossed half or more of it.
export async function buyLessFor(user) {
  const rows = await q(
    `SELECT p.id, p.produce, p.qty, COALESCE(p.bought_qty, p.qty) AS bought, p.state, p.tossed_frac,
            p.toss_reason, p.created_at,
            COALESCE((SELECT sum(c.qty) FROM crisper_items c WHERE c.parent_id = p.id AND c.state = 'tossed'), 0)::int AS child_tossed,
            COALESCE((SELECT bool_or(c.toss_reason = 'too_much') FROM crisper_items c WHERE c.parent_id = p.id), false) AS child_too_much
       FROM crisper_items p
      WHERE p.user_id = $1 AND p.parent_id IS NULL AND p.state IN ('active', 'used', 'tossed')
        AND p.created_at > now() - interval '180 days'
      ORDER BY p.created_at DESC`,
    [user.id]
  );
  const seen = new Map();
  for (const r of rows) {
    const list = seen.get(r.produce) || [];
    if (list.length < 2) list.push(r);
    seen.set(r.produce, list);
  }
  const out = [];
  for (const [produce, list] of seen) {
    const c = BY_NAME[produce];
    if (!c) continue;
    let hit = null;
    for (const r of list) {
      const bought = Math.max(1, r.bought || r.qty || 1);
      const own = r.state === 'active' ? 0 : (r.qty || 1) * tossedShare(r);
      const share = Math.min(1, (Number(r.child_tossed) + own) / bought);
      const tooMuch = r.toss_reason === 'too_much' || r.child_too_much;
      if (tooMuch || share >= 0.5) { hit = { r, bought, share, tooMuch }; break; }
    }
    if (!hit) continue;
    const eaten = Math.max(1, Math.round(hit.bought * (1 - hit.share)));
    const suggest = hit.bought > 1 ? Math.min(hit.bought - 1, eaten) : null;
    out.push({
      name: c.name,
      imageUrl: c.imageUrl,
      why: hit.tooMuch ? 'too_much' : 'tossed_half',
      tossedShare: Math.round(hit.share * 100) / 100,
      lastBought: hit.bought,
      suggest,
      boughtOn: new Date(hit.r.created_at).toISOString().slice(0, 10),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// views: active item views; lastTrip: [{ name, count, imageUrl }] from lastTripFor.
export async function shopList(user, views, lastTrip = []) {
  const have = new Map();
  for (const v of views) {
    const h = have.get(v.name) || { name: v.name, imageUrl: v.imageUrl, qty: 0, label: v.label, status: v.status, eatFirst: false };
    h.qty += v.qty || 1;
    h.eatFirst = h.eatFirst || !!v.eatFirst;
    have.set(v.name, h); // views are sorted, so the first label is the soonest
  }
  const buyLess = await buyLessFor(user);
  const less = Object.fromEntries(buyLess.map((b) => [b.name, b]));
  return {
    have: [...have.values()],
    buyLess,
    lastTrip: lastTrip.map((t) => ({
      name: t.name,
      count: t.count,
      imageUrl: t.imageUrl,
      have: have.get(t.name)?.qty || 0,
      buyLess: less[t.name] ? (less[t.name].suggest ?? 'smaller') : null,
    })),
  };
}
