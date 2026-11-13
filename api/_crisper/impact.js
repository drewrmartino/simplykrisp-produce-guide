// Impact tracker: turns finished items (used / tossed) into pounds, dollars,
// CO2e and a few game mechanics. Every number is an ESTIMATE and the UI says so.
//
// Sources
//  - Prices: USDA ERS "Fruit and Vegetable Prices" (2023 Circana retail data,
//    average fresh price per pound). https://www.ers.usda.gov/data-products/fruit-and-vegetable-prices
//    Items ERS doesn't publish fresh (est: true) use a conservative store-shelf estimate.
//  - Emissions: Poore & Nemecek (2018) via Our World in Data, total supply-chain
//    kg CO2e per kg by food group. https://ourworldindata.org/grapher/food-emissions-supply-chain
//    Production-side only; methane from a landfilled item would add more.
//  - Benchmark: EPA (2025) consumer waste of fresh produce ~27% of what is bought
//    (fresh veg 31.0 of 115.4 lb, fresh fruit 22.6 of 80.4 lb per capita).
//    https://www.epa.gov/system/files/documents/2025-04/costoffoodwastereport_508.pdf
//  - Driving: EPA, ~400 g CO2 per mile for a typical passenger vehicle.
//    https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle

import { scrapFor } from './scraps.js';

const CO2 = { // kg CO2e per kg of food
  apples: 0.43, bananas: 0.86, berries: 1.53, brassicas: 0.51, citrus: 0.39, onions: 0.48,
  fruit: 1.05, veg: 0.53, peas: 0.98, potatoes: 0.46, roots: 0.43, tomatoes: 2.09,
};

// name: [lb per receipt unit (one fruit, head, bunch, bag or clamshell), $/lb, CO2 group, price is estimate?]
const T = {
  'Apple': [0.4, 1.86, 'apples'],
  'Avocado': [0.4, 2.26, 'fruit'],
  'Banana': [0.33, 0.61, 'bananas'],
  'Blueberry': [0.75, 5.13, 'berries'],
  'Cantaloupe': [3, 0.79, 'fruit'],
  'Cherry': [1, 3.66, 'fruit'],
  'Grape': [2, 2.25, 'berries'],
  'Kiwi': [0.17, 2.83, 'fruit'],
  'Lemon': [0.25, 2.13, 'citrus', true],
  'Lime': [0.15, 2.0, 'citrus', true],
  'Mango': [0.75, 1.46, 'fruit'],
  'Orange': [0.4, 1.44, 'citrus'],
  'Peach': [0.33, 2.46, 'fruit'],
  'Pear': [0.4, 1.92, 'fruit'],
  'Pineapple': [4, 0.67, 'fruit'],
  'Plum': [0.25, 2.66, 'fruit'],
  'Strawberry': [1, 3.08, 'berries'],
  'Tomato': [0.33, 2.14, 'tomatoes'],
  'Watermelon': [10, 0.41, 'fruit'],
  'Nectarine': [0.33, 2.48, 'fruit'],
  'Papaya': [1.5, 1.31, 'fruit'],
  'Pomegranate': [0.6, 2.48, 'fruit'],
  'Asparagus': [1, 3.21, 'veg'],
  'Bell Pepper': [0.4, 1.6, 'veg'],
  'Broccoli': [1.25, 3.02, 'brassicas'],
  'Brussels Sprouts': [1, 3.04, 'brassicas'],
  'Cabbage': [2.5, 0.83, 'brassicas'],
  'Carrot': [1, 1.01, 'roots'],
  'Cauliflower': [2, 2.12, 'brassicas'],
  'Celery': [1.5, 1.33, 'veg'],
  'Corn': [0.6, 2.1, 'veg'],
  'Cucumber': [0.6, 1.09, 'veg'],
  'Eggplant': [1.25, 1.9, 'veg', true],
  'Garlic': [0.12, 4.5, 'onions', true],
  'Green Beans': [1, 2.66, 'veg'],
  'Kale': [0.5, 3.57, 'brassicas'],
  'Lettuce': [1, 2.0, 'veg'],
  'Mushroom': [0.5, 4.15, 'veg'],
  'Onion': [0.6, 1.06, 'onions'],
  'Peas': [0.5, 4.0, 'peas', true],
  'Potato': [0.5, 0.92, 'potatoes'],
  'Spinach': [0.4, 4.5, 'veg'],
  'Sweet Potato': [0.6, 1.16, 'roots'],
  'Zucchini': [0.5, 1.64, 'veg'],
  'Herbs (Fresh)': [0.15, 12, 'veg', true],
  'Radish': [0.4, 1.85, 'roots'],
  'Squash (Winter)': [2.5, 1.26, 'veg'],
  'Grapefruit': [0.75, 1.4, 'citrus'],
  'Apricot': [0.1, 3.8, 'fruit'],
  'Honeydew': [5, 1.25, 'fruit'],
  'Raspberry': [0.375, 7.97, 'berries'],
  'Blackberry': [0.375, 6.83, 'berries'],
  'Jalapeño': [0.05, 1.8, 'veg', true],
  'Cranberry': [0.75, 3.3, 'berries', true],
  'Fig': [0.5, 7, 'fruit', true],
  'Green Onion': [0.25, 4, 'onions', true],
  'Mandarin': [0.2, 1.59, 'citrus'],
  'Cilantro': [0.2, 5, 'veg', true],
  'Parsley': [0.2, 6, 'veg', true],
  'Basil': [0.1, 24, 'veg', true],
  'Bagged Salad': [0.5, 7, 'veg', true],
  'Bok Choy': [1, 2, 'brassicas', true],
  'Collard Greens': [1, 2.48, 'brassicas'],
  'Swiss Chard': [0.6, 3.5, 'veg', true],
  'Arugula': [0.3, 9, 'brassicas', true],
  'Mustard Greens': [1, 2.97, 'brassicas', true],
  'Beet': [1, 2, 'roots', true],
  'Ginger': [0.25, 4.5, 'roots', true],
  'Leek': [0.5, 3, 'onions', true],
  'Artichoke': [0.75, 2.51, 'veg'],
  'Pumpkin': [5, 0.8, 'veg', true],
  'Okra': [1, 5.68, 'veg'],
  'Plantain': [0.5, 0.9, 'bananas', true],
  'Tomatillo': [1, 2.2, 'veg', true],
  'Persimmon': [0.4, 3, 'fruit', true],
  'Parsnip': [1, 2.5, 'roots', true],
  'Turnip': [0.5, 1.5, 'roots', true],
  'Fennel': [1, 3, 'veg', true],
};
const DEFAULT = [0.5, 2.0, 'veg', true];


// Share of the edible part bought for home use that goes uneaten at the consumer
// level ("Other (cooking loss and uneaten food)"), latest year in USDA ERS
// Loss-Adjusted Food Availability (LAFA) data: Fruit (Apr 2023), Vegetables (May 2024).
// https://www.ers.usda.gov/data-products/food-availability-per-capita-data-system
// name: [percent uneaten, data year, LAFA series]. Items LAFA doesn't cover fall
// back to the EPA 27% all-produce figure.
const LAFA = {
  'Apple': [20, 2021, 'Fresh apples'],
  'Avocado': [33, 2021, 'Fresh avocados'],
  'Banana': [20, 2021, 'Fresh bananas'],
  'Blueberry': [8, 2021, 'Fresh blueberries'],
  'Cantaloupe': [43, 2021, 'Fresh cantaloupe'],
  'Cherry': [51, 2021, 'Fresh cherries'],
  'Grape': [33, 2021, 'Fresh grapes'],
  'Kiwi': [45, 2021, 'Fresh kiwi'],
  'Lemon': [44, 2022, 'Fresh lemons'],
  'Lime': [44, 2022, 'Fresh limes'],
  'Mango': [13, 2021, 'Fresh mangoes'],
  'Orange': [36, 2022, 'Fresh oranges'],
  'Peach': [42, 2021, 'Fresh peaches'],
  'Pear': [20, 2021, 'Fresh pears'],
  'Pineapple': [37, 2021, 'Fresh pineapple'],
  'Plum': [27, 2021, 'Fresh plums'],
  'Strawberry': [35, 2021, 'Fresh strawberries'],
  'Tomato': [7, 2022, 'Fresh tomatoes'],
  'Watermelon': [13, 2021, 'Fresh watermelon'],
  'Nectarine': [42, 2021, 'Fresh peaches'],
  'Papaya': [20, 2021, 'Fresh papaya'],
  'Grapefruit': [20, 2022, 'Fresh grapefruit'],
  'Apricot': [10, 2021, 'Fresh apricots'],
  'Honeydew': [43, 2021, 'Fresh honeydew'],
  'Raspberry': [20, 2021, 'Fresh raspberries'],
  'Cranberry': [26, 2021, 'Fresh cranberries'],
  'Asparagus': [18, 2022, 'Fresh asparagus'],
  'Bell Pepper': [39, 2022, 'Fresh bell peppers'],
  'Broccoli': [12, 2022, 'Fresh broccoli'],
  'Brussels Sprouts': [12, 2022, 'Fresh brussels sprouts'],
  'Cabbage': [24, 2022, 'Fresh cabbage'],
  'Carrot': [34, 2022, 'Fresh carrots'],
  'Cauliflower': [9, 2022, 'Fresh cauliflower'],
  'Celery': [39, 2022, 'Fresh celery'],
  'Corn': [32, 2022, 'Fresh sweet corn'],
  'Cucumber': [32, 2022, 'Fresh cucumbers'],
  'Eggplant': [26, 2022, 'Fresh eggplant'],
  'Garlic': [43, 2022, 'Fresh garlic'],
  'Green Beans': [24, 2022, 'Fresh snap beans'],
  'Kale': [38, 2022, 'Fresh kale'],
  'Lettuce': [24, 2022, 'Fresh leaf lettuce'],
  'Mushroom': [21, 2021, 'Fresh mushrooms'],
  'Onion': [43, 2022, 'Fresh onions'],
  'Potato': [16, 2022, 'Fresh potatoes'],
  'Spinach': [9, 2022, 'Fresh spinach'],
  'Sweet Potato': [44, 2022, 'Fresh sweet potatoes'],
  'Zucchini': [25, 2022, 'Fresh squash'],
  'Radish': [47, 2022, 'Fresh radishes'],
  'Squash (Winter)': [69, 2022, 'Fresh pumpkin'],
  'Pumpkin': [69, 2022, 'Fresh pumpkin'],
  'Blackberry': [20, 2021, 'Fresh raspberries (proxy)'],
  'Jalapeño': [39, 2022, 'Fresh bell peppers (proxy)'],
};

export const BENCHMARK_TOSS_RATE = 0.27; // EPA 2025, fresh fruit + vegetables
const KG_PER_LB = 0.45359237;
const KG_CO2_PER_MILE = 0.4;

export function factorsFor(name) {
  const [unitLb, usdPerLb, group, est] = T[name] || DEFAULT;
  return { unitLb, usdPerLb, kgCo2ePerKg: CO2[group], priceEstimated: !!est };
}

// "1.3 lb", "6 oz", "2.5lbs", "500 g", "1 kg" -> pounds. Anything else -> null.
export function parseWeightLb(w) {
  if (!w) return null;
  const m = String(w).toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|#|oz|ounces?|kg|g|grams?)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2];
  const lb = u.startsWith('lb') || u.startsWith('pound') || u === '#' ? n
    : u.startsWith('oz') || u.startsWith('ounce') ? n / 16
    : u === 'kg' ? n / KG_PER_LB
    : n / 453.592;
  return lb > 0 && lb < 200 ? lb : null;
}

// Typical household waste for one item, and what that means for this purchase.
export function wasteFor(name) {
  const w = LAFA[name];
  return w ? { rate: w[0] / 100, year: w[1], series: w[2], source: 'usda' }
    : { rate: BENCHMARK_TOSS_RATE, year: 2025, series: 'All fresh fruit and vegetables', source: 'epa' };
}

export function typicalWaste(row) {
  const w = wasteFor(row.produce);
  const i = itemImpact(row);
  const refuse = (scrapFor(row.produce)?.pct || 0) / 100;
  return {
    rate: w.rate,
    source: w.source,
    lb: r2(i.lb * (1 - refuse) * w.rate),
    usd: r2(i.usd * w.rate),
    co2Lb: r2((i.co2Kg / KG_PER_LB) * w.rate),
  };
}

export function itemImpact(row) {
  const f = factorsFor(row.produce);
  const lb = parseWeightLb(row.weight) ?? Math.max(1, row.qty || 1) * f.unitLb;
  return { lb, usd: lb * f.usdPerLb, co2Kg: lb * KG_PER_LB * f.kgCo2ePerKg };
}

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// Share of the edible part that was tossed: 1 for a full toss, else the logged portion.
export function tossedShare(r) {
  return r.state === 'tossed' ? 1 : Math.max(0, Math.min(1, Number(r.tossed_frac) || 0));
}

function totals(rows) {
  const t = { usedCount: 0, tossedCount: 0, partialCount: 0, usedLb: 0, tossedLb: 0, usedUsd: 0, tossedUsd: 0, usedCo2Kg: 0, tossedCo2Kg: 0, rescued: 0,
    trimLogged: 0, trimUsedLb: 0, trimCompostLb: 0, trimTrashLb: 0, trimUsed: 0, trimCompost: 0 };
  for (const r of rows) {
    const i = itemImpact(r);
    const refuse = (scrapFor(r.produce)?.pct || 0) / 100;
    const edible = i.lb * (1 - refuse);
    const f = tossedShare(r);
    if (r.state === 'tossed') t.tossedCount += 1;
    else { t.usedCount += 1; if (f > 0) t.partialCount += 1; }
    t.usedLb += edible * (1 - f);
    t.tossedLb += edible * f;
    // Money and emissions follow the whole purchase, split by the tossed share.
    t.usedUsd += i.usd * (1 - f);
    t.tossedUsd += i.usd * f;
    t.usedCo2Kg += i.co2Kg * (1 - f);
    t.tossedCo2Kg += i.co2Kg * f;
    if (r.state === 'used' && r.rescued) t.rescued += 1;
    if (r.trim) {
      const tl = i.lb * refuse;
      t.trimLogged += 1;
      if (r.trim === 'used') { t.trimUsedLb += tl; t.trimUsed += 1; }
      else if (r.trim === 'compost') { t.trimCompostLb += tl; t.trimCompost += 1; }
      else t.trimTrashLb += tl;
    }
  }
  const done = t.usedLb + t.tossedLb;
  return {
    usedCount: t.usedCount,
    tossedCount: t.tossedCount,
    partialCount: t.partialCount,
    rescued: t.rescued,
    usedLb: r1(t.usedLb),
    tossedLb: r1(t.tossedLb),
    usedUsd: r2(t.usedUsd),
    tossedUsd: r2(t.tossedUsd),
    tossedCo2Kg: r1(t.tossedCo2Kg),
    tossedCo2Lb: r1(t.tossedCo2Kg / KG_PER_LB),
    tossedMiles: Math.round(t.tossedCo2Kg / KG_CO2_PER_MILE),
    // Share of the edible part of finished produce (by weight) that was eaten.
    eatenRate: rows.length ? Math.round((t.usedLb / (done || 1)) * 1000) / 1000 : null,
    // vs. a household tossing the US-average share of the same haul.
    avoidedCo2Kg: rows.length ? r1(Math.max(0, (t.usedCo2Kg + t.tossedCo2Kg) * BENCHMARK_TOSS_RATE - t.tossedCo2Kg)) : 0,
    avoidedUsd: rows.length ? r2(Math.max(0, (t.usedUsd + t.tossedUsd) * BENCHMARK_TOSS_RATE - t.tossedUsd)) : 0,
    trim: {
      logged: t.trimLogged,
      usedLb: r1(t.trimUsedLb),
      compostLb: r1(t.trimCompostLb),
      trashLb: r1(t.trimTrashLb),
      usedCount: t.trimUsed,
      compostCount: t.trimCompost,
    },
  };
}

// Monday (ISO) of the week containing an ISO date.
function weekStart(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
}

function localDate(ts, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

// A "clean week" = Mon–Sun with at least one item eaten and nothing tossed
// (a toss = the whole item, or half or more of it; a little trimmed-off bit is fine).
// The current week counts once it qualifies so far; it never breaks a streak
// until a toss actually happens.
function streaks(rows, today, tz) {
  const weeks = new Map();
  let lastToss = null;
  for (const r of rows) {
    const day = localDate(r.state_at, tz);
    const w = weekStart(day);
    const e = weeks.get(w) || { used: 0, tossed: 0 };
    const bad = tossedShare(r) >= 0.5;
    e[bad ? 'tossed' : 'used'] += 1;
    weeks.set(w, e);
    if (bad && (!lastToss || day > lastToss)) lastToss = day;
  }
  const clean = (w) => { const e = weeks.get(w); return !!e && e.used > 0 && e.tossed === 0; };
  const prev = (w) => new Date(new Date(`${w}T00:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const thisWeek = weekStart(today);
  let current = 0;
  let w = thisWeek;
  if (!clean(w)) {
    const e = weeks.get(w);
    if (e && e.tossed) w = null; // tossed this week: streak is 0
    else w = prev(w); // nothing yet this week: streak carries from last week
  }
  while (w && clean(w)) { current += 1; w = prev(w); }

  let best = 0;
  const sorted = [...weeks.keys()].sort();
  if (sorted.length) {
    let run = 0;
    for (let x = sorted[0]; x <= thisWeek; x = new Date(new Date(`${x}T00:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10)) {
      run = clean(x) ? run + 1 : (weeks.get(x)?.tossed ? 0 : (x === thisWeek ? run : 0));
      best = Math.max(best, run);
    }
  }
  best = Math.max(best, current);
  const firstDay = rows.length ? localDate(rows.reduce((a, r) => (r.state_at < a ? r.state_at : a), rows[0].state_at), tz) : null;
  const ref = lastToss || firstDay;
  const daysSinceToss = ref ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${ref}T00:00:00Z`)) / 86400000)) : null;
  return { cleanWeeks: current, bestCleanWeeks: best, daysSinceToss, everTossed: !!lastToss };
}

const LEVELS = [
  { min: 0, name: 'Sprout' },
  { min: 5, name: 'Seedling' },
  { min: 15, name: 'Gardener' },
  { min: 40, name: 'Harvester' },
  { min: 100, name: 'Crisper Keeper' },
];

function level(points) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i += 1;
  const next = LEVELS[i + 1];
  return {
    name: LEVELS[i].name,
    points,
    next: next ? next.name : null,
    toNext: next ? next.min - points : 0,
    progress: next ? (points - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1,
  };
}

// rows: every used/tossed item for the user (produce, qty, weight, state, state_at, rescued)
export function buildImpact(rows, { today, tz, krisp }) {
  const cutoff = Date.now() - 30 * 86400000;
  const last30 = rows.filter((r) => new Date(r.state_at).getTime() > cutoff);
  const all = totals(rows);
  const d30 = totals(last30);
  const s = streaks(rows, today, tz);

  // Points: 1 per item eaten, +1 if eaten in its last couple of days,
  // +1 when the trim is used or composted instead of trashed.
  const points = all.usedCount + all.rescued + all.trim.usedCount + all.trim.compostCount;
  const recent90 = (() => { // 90% club looks at the last 30 days, min 15 finished items
    const n = d30.usedCount + d30.tossedCount;
    return n >= 15 && d30.eatenRate >= 0.9;
  })();

  const badges = [
    { id: 'first', name: 'First bite', desc: 'Mark your first item eaten', earned: all.usedCount >= 1 },
    { id: 'rescue', name: 'Rescuer', desc: 'Eat something in its last 2 days', earned: all.rescued >= 1 },
    { id: 'ten', name: '10 eaten', desc: 'Eat 10 tracked items', earned: all.usedCount >= 10 },
    { id: 'scrap', name: 'Scrap saver', desc: 'Use the trim from an item (stems, peels, cobs)', earned: all.trim.usedCount >= 1 },
    { id: 'compost', name: 'Composter', desc: 'Compost trim 5 times', earned: all.trim.compostCount >= 5 },
    { id: 'clean1', name: 'Clean week', desc: 'A week with nothing tossed', earned: s.bestCleanWeeks >= 1 },
    { id: 'clean3', name: '3-week streak', desc: '3 clean weeks in a row', earned: s.bestCleanWeeks >= 3 },
    { id: 'usd25', name: '$25 eaten', desc: 'Eat $25 of tracked produce', earned: all.usedUsd >= 25 },
    { id: 'club90', name: '90% club', desc: 'Eat 90%+ over 15+ items in 30 days', earned: recent90 },
    { id: 'beat', name: 'Beat the average', desc: `Toss less than ${Math.round(BENCHMARK_TOSS_RATE * 100)}% (10+ items)`, earned: all.usedCount + all.tossedCount >= 10 && all.eatenRate > 1 - BENCHMARK_TOSS_RATE },
  ];
  if (krisp?.owned) badges.push({ id: 'krisp', name: 'Fresh swap', desc: 'Krisp sachet changed on time', earned: !!krisp.changedOn && krisp.dueInDays >= 0 });

  return {
    last30: d30,
    allTime: all,
    streak: s,
    level: level(points),
    badges,
    benchmark: { tossRate: BENCHMARK_TOSS_RATE },
  };
}
