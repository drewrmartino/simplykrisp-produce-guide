// Pilot mode: a per-user cohort so a small pilot can measure its own effect.
//
//   NULL      not in a pilot. Everything is on (the default for everyone).
//   baseline  logging only for the first 14 days after joining, then everything on.
//   full      everything on from the day they join.
//   holdout   logging only for as long as they stay in the holdout.
//
// "Logging only" means Used / Tossed / toss reasons and the existing app keep
// working, but the new nudges stay hidden: the rescue card, fixes after a toss,
// the household comparison, Before-you-shop nudges, rescue options, the Eat
// First zone and the thermometer prompt. Set with POST /api/crisper/admin.

export const COHORTS = ['baseline', 'full', 'holdout'];
export const BASELINE_DAYS = 14;
const DAY = 86400000;

export function cleanCohort(c) {
  if (c === null || c === '' || c === 'none') return null;
  return COHORTS.includes(c) ? c : undefined;
}

export function baselineEnds(user) {
  if (user.cohort !== 'baseline') return null;
  const start = user.cohort_at ? new Date(user.cohort_at).getTime() : Date.now();
  return new Date(start + BASELINE_DAYS * DAY);
}

// phase: what the user is living through right now (null = not in a pilot).
export function pilotFor(user, now = Date.now()) {
  const cohort = COHORTS.includes(user.cohort) ? user.cohort : null;
  let phase = cohort;
  let featuresOnAt = null;
  if (cohort === 'baseline') {
    const ends = baselineEnds(user);
    featuresOnAt = ends.toISOString();
    phase = now >= ends.getTime() ? 'full' : 'baseline';
  }
  const on = phase === null || phase === 'full';
  return {
    cohort,
    phase,
    joinedAt: user.cohort_at ? new Date(user.cohort_at).toISOString() : null,
    featuresOnAt,
    features: {
      rescue: on, // "Rescue 1 item today" card, rescue streak, rescued-this-week dollars
      fixes: on, // the fix shown after a toss reason
      compare: on, // household comparison on the impact view
      shopNudges: on, // Before you shop list: "still have" and "buy less"
      rescueOptions: on, // cook / freeze / ferment on due items
      eatFirst: on, // Eat First zone on the kitchen map
      tempCheck: on, // crisper thermometer prompt
    },
  };
}

// Which period a finished item belongs to, for the admin scorecard.
export function periodFor(user, at) {
  const cohort = COHORTS.includes(user.cohort) ? user.cohort : null;
  if (!cohort) return 'not in a pilot';
  if (cohort !== 'baseline') return cohort;
  return new Date(at).getTime() < baselineEnds(user).getTime() ? 'baseline (first 14 days)' : 'baseline (features on)';
}
