// Builds one page per fruit and vegetable (seasonal/produce.json), adding the
// "why it goes bad" sections from data/spoilage.json where they exist.
//
//   npm run pages        (node scripts/build-produce-pages.mjs)
//
// Joins each spoilage entry with what the rest of the site already says, so
// nothing is written twice:
//   seasonal/produce.json      storage tips, shelf life, keep-away-from, Krisp claims
//   scripts/krisp-tiers.mjs    which items a Krisp truly helps
//   api/_crisper/scraps.js     use-it-up ideas for trimmings
//   lab/runs.json              matching Lab Notebook runs
//
// Writes static HTML that must be committed (search engines need real pages,
// not a client-rendered app):
//   produce/index.html                    all items
//   produce/<slug>/index.html             one page per item
//   index.html                            static A-Z list inside the app's #root
//   produce/what-went-wrong/index.html    symptom lookup
//   sitemap.xml, robots.txt
//
// dev/produce-pages.test.mjs fails if the data is invalid or the committed
// HTML is out of date, so re-run this after any data change.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KRISP } from './krisp-tiers.mjs';
import { SCRAPS } from '../api/_crisper/scraps.js';

export const ORIGIN = 'https://guide.simplykrisp.com';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

const VERDICTS = ['eat', 'cook', 'trim', 'toss'];
const KRISP_CAUSES = ['ethylene', 'ripening'];
const SHOP = 'https://simplykrisp.com/products/double-krisp';

// ---------- load + validate ----------

export function loadData() {
  return {
    spoilage: readJson('data/spoilage.json'),
    produce: readJson('seasonal/produce.json'),
    runs: readJson('lab/runs.json').runs,
    lab: readJson('lab/runs.json'),
  };
}

/** Returns a list of problems; empty means valid. */
export function validate({ spoilage, produce }) {
  const errs = [];
  const names = new Set(produce.map((p) => p.name));
  const slugs = new Set();
  const { sources, causes, verdicts } = spoilage;
  for (const v of VERDICTS) if (!verdicts[v]) errs.push(`verdicts.${v} missing`);
  for (const it of spoilage.items) {
    const at = it.name;
    if (!names.has(it.name)) errs.push(`${at}: not in seasonal/produce.json`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(it.slug || '')) errs.push(`${at}: bad slug "${it.slug}"`);
    if (slugs.has(it.slug)) errs.push(`${at}: duplicate slug`);
    slugs.add(it.slug);
    if (!it.display || !it.intro) errs.push(`${at}: needs display and intro`);
    if (!Array.isArray(it.failures) || it.failures.length < 2) errs.push(`${at}: needs at least 2 failures`);
    const ids = new Set();
    for (const f of it.failures || []) {
      const fa = `${at}/${f.id}`;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.id || '')) errs.push(`${fa}: bad id`);
      if (ids.has(f.id)) errs.push(`${fa}: duplicate id`);
      ids.add(f.id);
      for (const k of ['title', 'symptom', 'why', 'verdictNote']) if (!f[k] || typeof f[k] !== 'string') errs.push(`${fa}: missing ${k}`);
      if (!causes[f.cause]) errs.push(`${fa}: unknown cause "${f.cause}"`);
      if (!VERDICTS.includes(f.verdict)) errs.push(`${fa}: unknown verdict "${f.verdict}"`);
      if (!Array.isArray(f.prevent) || !f.prevent.length) errs.push(`${fa}: needs prevent tips`);
      if (!Array.isArray(f.rescue)) errs.push(`${fa}: rescue must be an array`);
      if (f.verdict === 'toss' && f.rescue && f.rescue.length) errs.push(`${fa}: a "toss" verdict should not suggest eating it`);
      if (!Array.isArray(f.sources) || !f.sources.length) errs.push(`${fa}: needs at least one source`);
      for (const s of f.sources || []) if (!sources[s]) errs.push(`${fa}: unknown source "${s}"`);
      if (typeof f.krispHelps !== 'boolean') errs.push(`${fa}: krispHelps must be true or false`);
      // The product only shows up where the evidence supports it.
      if (f.krispHelps && !KRISP[it.name]) errs.push(`${fa}: krispHelps but ${it.name} is not in KRISP (scripts/krisp-tiers.mjs)`);
      if (f.krispHelps && !KRISP_CAUSES.includes(f.cause)) errs.push(`${fa}: krispHelps only applies to ethylene or ripening failures`);
    }
  }
  for (const [k, s] of Object.entries(sources)) if (!/^https:\/\//.test(s.url || '')) errs.push(`source ${k}: needs an https url`);
  return errs;
}

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const utm = (content) => `utm_source=produce-guide&utm_medium=referral&utm_campaign=why-it-goes-bad&utm_content=${encodeURIComponent(content)}`;
const where = { refrigerator: 'Fridge', counter: 'Counter', counter_then_fridge: 'Counter, then fridge once ripe', pantry: 'Cool, dark pantry' };
const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const whereLong = { refrigerator: 'in the fridge', counter: 'on the counter', counter_then_fridge: 'on the counter until ripe, then in the fridge', pantry: 'in a cool, dark pantry' };
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const toC = (f) => Math.round(((f - 32) * 5) / 9);
// Names used in avoidWith that map to a page.
const AVOID_ALIAS = { Apples: 'Apple', Avocados: 'Avocado', Bananas: 'Banana', Broccoli: 'Broccoli', Cantaloupe: 'Cantaloupe', Carrots: 'Carrot', Cucumbers: 'Cucumber', Lettuce: 'Lettuce', Onions: 'Onion', Peaches: 'Peach', Pears: 'Pear', Peppers: 'Bell Pepper', Potatoes: 'Potato', Tomatoes: 'Tomato' };
// Page slug and how the item reads in a sentence, for items without spoilage data.
const NAMES = {
  Apple: ['apple', 'apples'], Blueberry: ['blueberry', 'blueberries'], Cantaloupe: ['cantaloupe', 'cantaloupe'], Cherry: ['cherry', 'cherries'],
  Grape: ['grape', 'grapes'], Kiwi: ['kiwi', 'kiwis'], Lemon: ['lemon', 'lemons'], Lime: ['lime', 'limes'], Mango: ['mango', 'mangoes'],
  Orange: ['orange', 'oranges'], Peach: ['peach', 'peaches'], Pear: ['pear', 'pears'], Pineapple: ['pineapple', 'pineapple'], Plum: ['plum', 'plums'],
  Watermelon: ['watermelon', 'watermelon'], Nectarine: ['nectarine', 'nectarines'], Papaya: ['papaya', 'papaya'], Pomegranate: ['pomegranate', 'pomegranates'],
  Asparagus: ['asparagus', 'asparagus'], 'Brussels Sprouts': ['brussels-sprouts', 'Brussels sprouts'], Cabbage: ['cabbage', 'cabbage'],
  Cauliflower: ['cauliflower', 'cauliflower'], Corn: ['corn', 'corn'], Eggplant: ['eggplant', 'eggplant'], Garlic: ['garlic', 'garlic'],
  'Green Beans': ['green-beans', 'green beans'], Onion: ['onion', 'onions'], Peas: ['peas', 'peas'], Potato: ['potato', 'potatoes'],
  'Sweet Potato': ['sweet-potato', 'sweet potatoes'], Zucchini: ['zucchini', 'zucchini'], Radish: ['radish', 'radishes'],
  'Squash (Winter)': ['winter-squash', 'winter squash'], Grapefruit: ['grapefruit', 'grapefruit'], Apricot: ['apricot', 'apricots'],
  Honeydew: ['honeydew', 'honeydew'], Blackberry: ['blackberry', 'blackberries'], 'Jalapeño': ['jalapeno', 'jalapeños'],
  Cranberry: ['cranberry', 'cranberries'], Fig: ['fig', 'figs'], 'Green Onion': ['green-onion', 'green onions'],
};
const SINGULAR = new Set(['asparagus']);
const isPlural = (display) => display.endsWith('s') && !SINGULAR.has(display);
const navName = (n) => (n === 'Herbs (Fresh)' ? 'Fresh herbs' : n === 'Squash (Winter)' ? 'Winter squash' : n);
// Written for a plural subject; agree() adjusts for singular items.
const PRODUCES = {
  very_low: 'give off almost no ethylene, so {they} {are} safe to store next to most other produce.',
  low: 'give off only a little ethylene, so {they} {are} fine next to most other produce.',
  medium: 'give off a moderate amount of ethylene as {they} ripen, enough to speed up sensitive produce in a closed drawer.',
  high: 'give off a lot of ethylene as {they} ripen. Keep {them} away from greens, broccoli and other sensitive produce.',
  very_high: 'are one of the biggest ethylene sources in the kitchen. Keep {them} apart from almost everything else.',
};
const SENSES = {
  high: 'are very sensitive to ethylene. Even a little in a closed drawer speeds up how fast {they} age.',
  medium: 'are somewhat sensitive to ethylene, so storing {them} away from ripening fruit helps.',
  low: 'are barely affected by ethylene.',
};
function agree(text, plural) {
  let t = text.replace(/\{they\}/g, plural ? 'they' : 'it').replace(/\{them\}/g, plural ? 'them' : 'it').replace(/\{are\}/g, plural ? 'are' : 'is');
  if (!plural) t = t.replace(/^give off/, 'gives off').replace(/^are /, 'is ').replace(/ it ripen\b/g, ' it ripens').replace(/ it age\b/g, ' it ages');
  return t;
}

function labRunsFor(item, runs) {
  const terms = [item.name, item.display, ...(item.labTerms || [])].map((t) => t.toLowerCase());
  return runs.filter((r) => terms.some((t) => String(r.produce || '').toLowerCase().includes(t)));
}

function head({ title, desc, pathname, jsonld = [], extra = '' }) {
  const url = ORIGIN + pathname;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:site_name" content="Simply Krisp Produce Guide" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${ORIGIN}/icons/share-1200x630.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" href="/favicon.png?v=2" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#2e431f" />
<link rel="apple-touch-icon" sizes="180x180" href="${ORIGIN}/icons/sk-home-180.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Questrial&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/produce/produce.css" />
<script>if(window.self!==window.top){document.documentElement.className+=' embedded';}</script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}${extra}
</head>
<body>
<script src="/assets/sk-header.js"></script>
<header><div class="wrap hdr">
  <a class="brand" href="/"><div><div class="name">Simply Krisp</div><div class="sub">Produce Guide</div></div></a>
  <nav><a href="/">Storage Guide</a><a href="/seasonal">In Season</a><a href="/produce">Produce A–Z</a><a href="/lab">Lab Notebook</a><a href="/krisper">My Krisper</a><a class="shop" href="https://simplykrisp.com/?${utm('header')}" target="_blank" rel="noopener">Shop</a></nav>
</div></header>
`;
}

function foot(year) {
  return `<footer><div class="wrap">
  <p><strong>Food safety:</strong> These pages describe quality and common spoilage. They are not a substitute for your own judgment. If something smells wrong, is slimy, or is moldy on soft produce, throw it out. Mold guidance follows <a href="https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/molds-food-are-they-dangerous" target="_blank" rel="noopener">USDA FSIS</a>, and spoilage causes come mainly from the <a href="https://postharvest.ucdavis.edu/produce-facts-sheets" target="_blank" rel="noopener">UC Davis Postharvest Center</a>.</p>
  <p class="fine">&copy; ${year} Simply Krisp. 1% for the Planet member.</p>
</div></footer>
</body>
</html>
`;
}

function crumbs(trail) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${trail
    .map(([label, href], i) => (i < trail.length - 1 ? `<a href="${href}">${esc(label)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(label)}</span>`))
    .join('')}</nav>`;
}

function crumbLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: ORIGIN + href })),
  };
}

// Same "More from Simply Krisp" row as the other guide pages.
const TOOLS = `<nav class="sk-tools" aria-label="Simply Krisp tools"><style>.sk-tools{max-width:900px;margin:36px auto 0;padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;font:14px/1.4 'DM Sans',system-ui,sans-serif;color:hsl(96 6% 38%);border-top:1px solid hsl(48 10% 87%)}.sk-tools a{color:hsl(96 14% 22%);text-decoration:none}.sk-tools a:hover{text-decoration:underline}.sk-tools a[aria-current]{font-weight:700}html.embedded .sk-tools{display:none}</style><span>More from Simply Krisp:</span><a href="/">Storage Guide</a><a href="/seasonal">In Season</a><a href="/produce" aria-current="page">Produce A–Z</a><a href="/lab">Lab Notebook</a><a href="/krisper">My Krisper</a></nav>`;

const verdictTag = (v, verdicts) => `<span class="verdict v-${v}">${esc(verdicts[v].label)}</span>`;
const causeTag = (c, causes) => `<span class="cause">${esc(causes[c].label)}</span>`;

// ---------- item page ----------

/** One entry per item in seasonal/produce.json, joined with spoilage data where it exists. */
function allItems(ctx) {
  const sp = Object.fromEntries(ctx.spoilage.items.map((i) => [i.name, i]));
  return ctx.produce.map((p) => {
    const it = sp[p.name];
    const [slug, display] = it ? [it.slug, it.display] : NAMES[p.name] || [p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), p.name.toLowerCase()];
    return { name: p.name, slug, display, plural: isPlural(display), p, sp: it || null };
  });
}

/** Items that should not share a drawer with this one, in either direction. */
function keepApart(e, ctx) {
  const out = new Map();
  for (const a of e.p.avoidWith || []) out.set(AVOID_ALIAS[a] || a, AVOID_ALIAS[a] || a);
  for (const o of ctx.all) {
    if (o.name === e.name) continue;
    if ((o.p.avoidWith || []).some((a) => (AVOID_ALIAS[a] || a) === e.name)) out.set(o.name, o.name);
  }
  return [...out.keys()];
}

function itemLink(name, ctx) {
  const o = ctx.bySlugName[name];
  return o ? `<a href="/produce/${o.slug}">${esc(o.display)}</a>` : esc(name.toLowerCase());
}

// Strong ethylene producers would otherwise list half the guide.
function apartText(apart, ctx) {
  if (apart.length <= 8) return list(apart.map((n) => itemLink(n, ctx)));
  return `most other produce, especially ${list(apart.slice(0, 6).map((n) => itemLink(n, ctx)))}`;
}

function itemPage(e, ctx) {
  const { spoilage, runs } = ctx;
  const { causes, verdicts, sources } = spoilage;
  const { p, sp: item, display, plural } = e;
  const scraps = SCRAPS[e.name];
  const lab = labRunsFor(item || { name: e.name, display }, runs);
  const pathname = `/produce/${e.slug}`;
  const Title = cap(display);
  const they = plural ? 'they' : 'it';
  const them = plural ? 'them' : 'it';
  const title = item
    ? `How to store ${display}, and why ${they} go${plural ? '' : 'es'} bad | Simply Krisp`
    : `How to store ${display}, and how long ${they} last${plural ? '' : 's'} | Simply Krisp`;
  const desc = item
    ? `Where to keep ${display}, how long ${they} last${plural ? '' : 's'}, and what causes ${item.failures.map((f) => f.title.toLowerCase()).slice(0, 2).join(' or ')}, with whether it's still OK to eat.`
    : `Keep ${display} ${whereLong[p.storageLocation]}. ${cap(they)} last${plural ? '' : 's'} ${p.shelfLife.replace(/ \(.*\)$/, '')}. Storage tips, what to keep ${them} away from, and how to pick good ${display}.`;
  const trail = [['Produce Guide', '/'], ['All produce', '/produce'], [navName(e.name), pathname]];

  const apart = keepApart(e, ctx);
  const facts = `<dl class="facts">
  <div><dt>Where to keep ${them}</dt><dd>${esc(where[p.storageLocation] || p.storageLocation)}</dd></div>
  <div><dt>How long ${they} last${plural ? '' : 's'}</dt><dd>${esc(p.shelfLife)}</dd></div>
  <div><dt>Best temperature</dt><dd>About ${p.optimalTempF}&deg;F (${toC(p.optimalTempF)}&deg;C)</dd></div>
  <div><dt>Don't store next to</dt><dd>${apart.length ? cap(apartText(apart, ctx)).replace(/^<a href="([^"]+)">(.)/, (m, h, c) => `<a href="${h}">${c.toUpperCase()}`) : 'Nothing in particular'}</dd></div>
</dl>`;

  const lede = item
    ? item.intro
    : `${Title} keep${plural ? '' : 's'} best ${whereLong[p.storageLocation]}, at about ${p.optimalTempF}°F, and last${plural ? '' : 's'} ${p.shelfLife.replace(/ \(.*\)$/, '')}. Here is how to store ${them}, what to keep ${them} away from, and how to pick good ${display}.`;

  // Krisp: only where the data says it helps, otherwise the honest reason it doesn't.
  const anyKrisp = item ? item.failures.some((f) => f.krispHelps) : p.krispRecommended;
  const krispNote = p.krispRecommended && p.krispBenefit
    ? `<p class="aside"><strong>Does a Krisp help?</strong> ${esc(p.krispBenefit)}${item ? '' : ` <a href="${SHOP}?${utm(e.slug + '-storage')}" target="_blank" rel="noopener">See the Double Krisp</a>`}</p>`
    : p.noBenefitReason ? `<p class="aside"><strong>Does a Krisp help?</strong> ${esc(p.noBenefitReason)}</p>` : '';
  const storage = `<section class="sec" id="storage"><h2>How to store ${esc(display)}</h2>
  <ul class="tips">${p.storageTips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  ${p.ripeTip ? `<p><strong>Picking good ${esc(display)}:</strong> ${esc(p.ripeTip)}</p>` : ''}
  ${item && anyKrisp ? '' : krispNote}</section>`;

  const eth = `<section class="sec" id="ethylene"><h2>${Title} and ethylene</h2>
  <p>Ethylene is a gas that ripening produce gives off. In a closed crisper drawer it builds up and makes sensitive produce yellow, soften or sprout sooner.</p>
  ${p.ethyleneNote
    ? `<p>${esc(p.ethyleneNote)}</p>` // where the published data is missing, say so instead of guessing
    : `<ul class="tips"><li>${esc(Title)} ${esc(agree(PRODUCES[p.ethyleneProduction] || PRODUCES.low, plural))}</li><li>${esc(Title)} ${esc(agree(SENSES[p.ethyleneSensitivity] || SENSES.low, plural))}</li></ul>`}
  ${apart.length ? `<p>Keep ${them} apart from ${apartText(apart, ctx)}.</p>` : ''}</section>`;

  let fails = '';
  let chips = '';
  let srcSec = '';
  let faq = null;
  if (item) {
    const order = [];
    for (const f of item.failures) for (const s of f.sources) if (!order.includes(s)) order.push(s);
    const ref = (s) => `<a class="ref" href="#src-${s}" aria-label="Source ${order.indexOf(s) + 1}">${order.indexOf(s) + 1}</a>`;
    faq = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: item.failures.map((f) => ({
        '@type': 'Question',
        name: `${Title}: ${f.title.toLowerCase()}. Is it still OK to eat?`,
        acceptedAnswer: { '@type': 'Answer', text: `${f.verdictNote} Why it happens: ${f.why}` },
      })),
    };
    chips = `<div class="jump"><span class="lbl">What are you seeing?</span><div class="chips">${item.failures.map((f) => `<a class="chip" href="#${f.id}">${esc(f.title)}</a>`).join('')}</div></div>`;
    const cards = item.failures.map((f) => {
      const krisp = f.krispHelps && p.krispBenefit
        ? `<div class="krisp"><span class="lbl">Where a Krisp fits</span><p>${esc(p.krispBenefit)} <a href="${SHOP}?${utm(e.slug + '-' + f.id)}" target="_blank" rel="noopener">See the Double Krisp</a></p></div>`
        : '';
      const rescue = f.rescue.length
        ? `<div class="blk"><span class="lbl">Use it up</span><ul>${f.rescue.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`
        : '';
      return `<article class="fail" id="${f.id}">
  <h3>${esc(f.title)}</h3>
  <div class="tags">${causeTag(f.cause, causes)}${verdictTag(f.verdict, verdicts)}</div>
  <p class="symptom"><span class="lbl">What you'll see</span>${esc(f.symptom)}</p>
  <div class="grid2">
    <div class="blk"><span class="lbl">Why it happens</span><p>${esc(f.why)} ${f.sources.map(ref).join('')}</p></div>
    <div class="blk ok v-${f.verdict}"><span class="lbl">Is it still OK?</span><p>${esc(f.verdictNote)}</p></div>
  </div>
  <div class="grid2">
    <div class="blk"><span class="lbl">Prevent it next time</span><ul>${f.prevent.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    ${rescue}
  </div>
  ${krisp}
</article>`;
    }).join('\n');
    fails = `<section class="fails" id="why" aria-labelledby="why-h"><h2 id="why-h" class="fails-h">Why ${esc(display)} go${plural ? '' : 'es'} bad</h2>
${cards}
  </section>
  <div class="lookup-band"><p>Not sure what you're looking at? Pick the produce and the symptom.</p><a class="btn" href="/produce/what-went-wrong?item=${e.slug}">What went wrong?</a></div>`;
    srcSec = `<section class="sec" id="sources"><h2>Sources</h2><ol class="srcs">${order
      .map((s) => `<li id="src-${s}"><a href="${esc(sources[s].url)}" target="_blank" rel="noopener">${esc(sources[s].title)}</a>, ${esc(sources[s].publisher)}</li>`)
      .join('')}</ol></section>`;
  }

  const scrapSec = scraps ? `<section class="sec" id="scraps"><h2>The part people throw away</h2>
  <p>About ${scraps.pct}% of ${esc(display)} by weight is usually trimmed off as ${esc(scraps.part)} (USDA FoodData Central). Some of it can still be used:</p>
  <ul class="tips">${scraps.ideas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : '';

  const labSec = lab.length ? `<section class="sec" id="lab"><h2>From the Lab Notebook</h2>
  ${lab.map((r) => `<a class="labrun" href="${hasPage(r) ? `/lab/${esc(r.id)}` : `/lab#${esc(r.id)}`}"><span class="badge b-${r.status === 'complete' ? 'done' : r.status === 'in progress' ? 'live' : 'planned'}">${esc(r.status)}</span><b>${esc(r.title)}</b><span>${esc(r.result)}</span></a>`).join('')}
  <p class="more">Home tests in one refrigerator, published as they happen, including the ones that show no difference.</p></section>` : '';

  // Same shelf, same kind of produce: the next thing a reader is likely to look up.
  const related = ctx.all
    .filter((o) => o.name !== e.name && o.p.category === p.category && o.p.storageLocation === p.storageLocation)
    .slice(0, 8);
  const relSec = related.length ? `<section class="sec" id="related"><h2>Also stored ${esc(whereLong[p.storageLocation])}</h2>
  <ul class="rel">${related.map((o) => `<li><a href="/produce/${o.slug}"><img src="${esc(o.p.imageUrl)}" alt="" width="24" height="24" loading="lazy" />${esc(navName(o.name))}</a></li>`).join('')}</ul>
  <p class="more"><a href="/produce">All ${ctx.all.length} fruits and vegetables</a></p></section>` : '';

  const h1 = item ? `How to store ${esc(display)}, and why ${they} go${plural ? '' : 'es'} bad` : `How to store ${esc(display)}`;
  return head({ title, desc, pathname, jsonld: [crumbLd(trail), ...(faq ? [faq] : [])] }) + `
<main class="wrap">
  ${crumbs(trail)}
  <section class="hero">
    <div class="ttl"><img src="${esc(p.imageUrl)}" alt="" width="56" height="56" /><div>
      <div class="eyebrow"><span class="dot"></span> Produce guide</div>
      <h1>${h1}</h1>
    </div></div>
    <p class="lede">${esc(lede)}</p>
    ${facts}
    ${chips}
  </section>

  ${storage}
  ${fails}
  ${eth}
  ${scrapSec}
  ${labSec}
  ${relSec}
  ${srcSec}

</main>
${TOOLS}
` + foot(ctx.spoilage.meta.updated.slice(0, 4));
}

// ---------- index ----------

const GROUPS = [['fruit', 'Fruit'], ['vegetable', 'Vegetables and herbs']];

function indexPage(ctx) {
  const { all, items, spoilage } = ctx;
  const trail = [['Produce Guide', '/'], ['All produce', '/produce']];
  const title = 'How to store fruits and vegetables, and why they go bad | Simply Krisp';
  const desc = `Where to keep ${all.length} fruits and vegetables, how long each one lasts, what not to store together, and what slimy, yellow or moldy produce means.`;
  const totalFails = items.reduce((n, i) => n + i.failures.length, 0);
  const causeCounts = {};
  for (const it of items) for (const f of it.failures) causeCounts[f.cause] = (causeCounts[f.cause] || 0) + 1;
  const topCauses = Object.entries(causeCounts).sort((a, b) => b[1] - a[1]);

  // The badge only means something while some items are still storage-only.
  const allCovered = all.every((e) => e.sp);
  const card = (e) => `<li class="arow"><a href="/produce/${e.slug}"><img src="${esc(e.p.imageUrl)}" alt="" width="28" height="28" loading="lazy" /><b>${esc(navName(e.name))}</b><span>${esc(where[e.p.storageLocation])} &middot; ${esc(e.p.shelfLife.replace(/ \(.*\)$/, ''))}</span>${!allCovered && e.sp ? '<em>Spoilage guide</em>' : ''}</a></li>`;
  const sorted = [...all].sort((a, b) => navName(a.name).localeCompare(navName(b.name)));
  const groups = GROUPS.map(([k, label]) => `<section class="agroup" aria-labelledby="g-${k}"><h2 id="g-${k}">${label}</h2><ul class="alist">${sorted.filter((e) => e.p.category === k).map(card).join('')}</ul></section>`).join('\n');

  const causes = topCauses.map(([c, n]) => `<li><b>${esc(spoilage.causes[c].label)}</b><span>${esc(spoilage.causes[c].blurb)}</span><em>${n} of ${totalFails}</em></li>`).join('');

  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: sorted.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/produce/${e.slug}`, name: navName(e.name) })),
  };

  return head({ title, desc, pathname: '/produce', jsonld: [crumbLd(trail), itemList] }) + `
<main class="wrap">
  ${crumbs(trail)}
  <section class="hero">
    <div class="eyebrow"><span class="dot"></span> Produce guide</div>
    <h1>How to store fruits and vegetables, and why they go bad</h1>
    <p class="lede">Pick a fruit or vegetable to see where to keep it, how long it lasts and what not to store it with. ${allCovered ? 'Each page also explains what went wrong when it goes slimy, yellow or moldy, and whether it is still OK to eat.' : 'Items marked "Spoilage guide" also explain what went wrong when it goes slimy, yellow or moldy.'}</p>
    <div class="cta-row"><a class="btn" href="/produce/what-went-wrong">What went wrong? Pick a symptom</a><a class="btn ghost" href="/">Interactive storage guide</a></div>
  </section>

${groups}

  <details class="sec fold"><summary>What usually causes it</summary><p>Across the ${items.length} spoilage guides, ethylene is only part of the picture, which is why storage habits matter as much as any product.</p><ul class="causes">${causes}</ul></details>
</main>
${TOOLS}
` + foot(ctx.spoilage.meta.updated.slice(0, 4));
}

// ---------- guide home (static fallback inside the app's #root) ----------

// The Storage Guide home is a client-rendered app, so crawlers that don't run
// JavaScript would see an empty page. This list sits inside #root and is
// replaced as soon as the app mounts.
function rootIndex(ctx) {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const sorted = [...ctx.all].sort((a, b) => navName(a.name).localeCompare(navName(b.name)));
  const lists = GROUPS.map(([k, label]) => `<h2>${label}</h2><ul>${sorted.filter((e) => e.p.category === k).map((e) => `<li><a href="/produce/${e.slug}">How to store ${esc(e.display)}</a></li>`).join('')}</ul>`).join('');
  const block = `<div id="root"><!--static--><main style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif"><h1>Produce Storage Guide</h1><p>Where to keep ${ctx.all.length} fruits and vegetables, how long each one lasts, and what not to store together. <a href="/produce">See all produce</a> or <a href="/produce/what-went-wrong">find out what went wrong</a>.</p>${lists}</main><!--/static--></div>`;
  const n = ctx.all.length;
  return html
    .replace(/How to Store \d+ Fruits and Vegetables/, `How to Store ${n} Fruits and Vegetables`)
    .replace(/(<meta name="description" content="Where to keep )\d+( fruits and vegetables)/, `$1${n}$2`)
    .replace(/<div id="root">(?:<!--static-->[\s\S]*?<!--\/static-->)?<\/div>/, block);
}

// ---------- symptom lookup ----------

function lookupPage(ctx) {
  const { items, byName, spoilage } = ctx;
  const trail = [['Produce Guide', '/'], ['All produce', '/produce'], ['What went wrong?', '/produce/what-went-wrong']];
  const title = 'What went wrong with my produce? Symptom checker | Simply Krisp';
  const desc = 'Pick the fruit or vegetable and what you see. Get the cause, whether it is still OK to eat, and how to prevent it next time.';
  const data = {
    causes: Object.fromEntries(Object.entries(spoilage.causes).map(([k, v]) => [k, v.label])),
    verdicts: Object.fromEntries(Object.entries(spoilage.verdicts).map(([k, v]) => [k, v.label])),
    items: items.map((it) => ({
      slug: it.slug,
      name: it.name === 'Herbs (Fresh)' ? 'Fresh herbs' : it.name,
      img: byName[it.name].imageUrl,
      f: it.failures.map((f) => ({ id: f.id, t: f.title, c: f.cause, v: f.verdict, n: f.verdictNote, w: f.why, p: f.prevent, r: f.rescue })),
    })),
  };
  const fallback = items.map((it) => `<li><a href="/produce/${it.slug}">${esc(it.name === 'Herbs (Fresh)' ? 'Fresh herbs' : it.name)}</a></li>`).join('');
  return head({ title, desc, pathname: '/produce/what-went-wrong', jsonld: [crumbLd(trail)] }) + `
<main class="wrap">
  ${crumbs(trail)}
  <section class="hero">
    <div class="eyebrow"><span class="dot"></span> Symptom checker</div>
    <h1>What went wrong?</h1>
    <p class="lede">Pick the produce, then what you see. You'll get the likely cause, whether it's still OK to eat, and how to stop it next time.</p>
  </section>
  <section class="step" aria-labelledby="s1"><h2 id="s1"><span class="num">1</span>What is it?</h2><div class="pick" id="items" role="group" aria-label="Produce"></div></section>
  <section class="step" id="step2" hidden aria-labelledby="s2"><h2 id="s2"><span class="num">2</span>What do you see?</h2><div class="pick sym" id="syms" role="group" aria-label="Symptom"></div></section>
  <section id="answer" aria-live="polite"></section>
  <noscript><ul class="tips">${fallback}</ul></noscript>
</main>
<script id="wwdata" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script src="/produce/lookup.js"></script>
${TOOLS}
` + foot(ctx.spoilage.meta.updated.slice(0, 4));
}

// ---------- Lab Notebook run pages ----------

// A run gets its own page once it has started; planned runs have nothing to
// show yet, so they stay as a card on /lab only.
const hasPage = (r) => r.status !== 'planned';
const runBadge = (st) => `<span class="badge b-${st === 'complete' ? 'done' : st === 'in progress' ? 'live' : 'planned'}">${esc(st)}</span>`;
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '');
function clip(t, n = 155) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:]$/, '') + '…';
}

function labPage(run, ctx) {
  const { meta, runs } = ctx.lab;
  const trail = [['Lab Notebook', '/lab'], [run.title, `/lab/${run.id}`]];
  const foods = ctx.all.filter((e) => labRunsFor({ name: e.name, display: e.display, labTerms: (ctx.items.find((i) => i.name === e.name) || {}).labTerms }, [run]).length);
  const imgs = (run.images || []).map((im) => `<figure><img loading="lazy" src="${esc(im.src)}" alt="${esc(im.alt || '')}" /><figcaption>${esc(im.caption || '')}</figcaption></figure>`).join('');
  const others = runs.filter((r) => r.id !== run.id);
  const body = `${head({
    title: `${run.title} | Simply Krisp Lab Notebook`,
    desc: clip(`${run.status === 'complete' ? 'Results' : 'A home fridge test in progress'}: ${run.question}`),
    pathname: `/lab/${run.id}`,
    jsonld: [crumbLd(trail)],
  })}
<main class="wrap">
  ${crumbs(trail)}
  <section class="hero">
    <div class="eyebrow"><span class="dot"></span> Lab Notebook</div>
    <h1>${esc(run.title)}</h1>
    <p class="runmeta">${runBadge(run.status)}${run.started ? `<span>Started ${fmtDate(run.started)}</span>` : ''}<span>${esc(run.produce)}</span></p>
  </section>
  <section class="sec"><h2>The question</h2><p>${esc(run.question)}</p></section>
  <section class="sec"><h2>What we saw</h2><p>${esc(run.result)}</p>${imgs ? `<div class="imgs">${imgs}</div>` : ''}</section>
  <section class="sec"><h2>How we test</h2><p>${esc(meta.method)}</p><p class="more">Last updated ${fmtDate(meta.updated)}.</p></section>
  ${foods.length ? `<section class="sec"><h2>Storage guides for this produce</h2><div class="rel">${foods.map((e) => `<a href="/produce/${e.slug}">How to store ${esc(e.display)}</a>`).join('')}</div></section>` : ''}
  ${others.length ? `<section class="sec"><h2>Other tests</h2>${others.map((r) => `<a class="labrun" href="${hasPage(r) ? `/lab/${esc(r.id)}` : `/lab#${esc(r.id)}`}">${runBadge(r.status)}<b>${esc(r.title)}</b><span>${esc(r.result)}</span></a>`).join('')}</section>` : ''}
  <div class="band"><p>Want to be told when a new run is published? One email per test, nothing else.</p><a class="btn" href="https://simplykrisp.com/pages/lab-notebook-updates?${utm('lab-run')}" target="_blank" rel="noopener">Get test updates</a></div>
</main>
${TOOLS}
${foot(new Date().getFullYear())}`;
  return body;
}

// Prerender the run cards into /lab so crawlers see them; the page script
// still refreshes them from runs.json in the browser.
function labIndex(ctx) {
  const html = readFileSync(path.join(root, 'lab/index.html'), 'utf8');
  const cards = ctx.lab.runs.map((r) => `<article class="run" id="${esc(r.id)}"><h2>${hasPage(r) ? `<a href="/lab/${esc(r.id)}">${esc(r.title)}</a>` : esc(r.title)}</h2><div class="rmeta"><span class="badge ${r.status === 'in progress' ? 'live' : r.status === 'complete' ? 'done' : 'planned'}">${esc(r.status)}</span>${r.started ? `<span>Started ${fmtDate(r.started)}</span>` : ''}<span>${esc(r.produce)}</span></div><div class="q"><span class="lbl">Question</span>${esc(r.question)}</div><div class="r"><span class="lbl">What we saw</span>${esc(r.result)}</div>${hasPage(r) ? `<a class="full" href="/lab/${esc(r.id)}">Full run &rarr;</a>` : ''}</article>`).join('');
  return html.replace(/<section class="runs" id="runs" aria-live="polite">[\s\S]*?<\/section>/, `<section class="runs" id="runs" aria-live="polite">${cards}</section>`);
}

// ---------- sitemap ----------

function sitemap(ctx) {
  const today = ctx.spoilage.meta.updated;
  const urls = ['/', '/seasonal', '/lab', '/lab/crisper-map', '/produce', '/produce/what-went-wrong', ...ctx.all.map((i) => `/produce/${i.slug}`), ...ctx.lab.runs.filter(hasPage).map((r) => `/lab/${r.id}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
}

const ROBOTS = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /krisper
Disallow: /crisper

Sitemap: ${ORIGIN}/sitemap.xml
`;

// ---------- build ----------

/** Returns { relativePath: contents } for every generated file. */
export function render(data = loadData()) {
  const errs = validate(data);
  if (errs.length) throw new Error('data/spoilage.json is invalid:\n  ' + errs.join('\n  '));
  const byName = Object.fromEntries(data.produce.map((p) => [p.name, p]));
  const ctx = { ...data, byName, items: data.spoilage.items };
  ctx.lab = data.lab || { meta: { method: '', updated: '' }, runs: data.runs || [] };
  ctx.all = allItems(ctx);
  ctx.bySlugName = Object.fromEntries(ctx.all.map((e) => [e.name, e]));
  const out = {
    'produce/index.html': indexPage(ctx),
    'produce/what-went-wrong/index.html': lookupPage(ctx),
    'sitemap.xml': sitemap(ctx),
    'robots.txt': ROBOTS,
    // Lets /seasonal link each card to its page without duplicating the list.
    'produce/pages.json': JSON.stringify(Object.fromEntries(ctx.all.map((i) => [i.name, i.slug])), null, 2) + '\n',
    'index.html': rootIndex(ctx),
    'lab/index.html': labIndex(ctx),
    'lab/pages.json': JSON.stringify(ctx.lab.runs.filter(hasPage).map((r) => r.id)) + '\n',
  };
  for (const r of ctx.lab.runs.filter(hasPage)) out[`lab/${r.id}/index.html`] = labPage(r, ctx);
  for (const e of ctx.all) out[`produce/${e.slug}/index.html`] = itemPage(e, ctx);
  return out;
}

function main() {
  const out = render();
  // Remove item folders that no longer exist in the data.
  const dir = path.join(root, 'produce');
  const keep = new Set(Object.keys(out).filter((k) => k.startsWith('produce/')).map((k) => k.split('/')[1]));
  if (existsSync(dir)) for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory() && !keep.has(d.name)) rmSync(path.join(dir, d.name), { recursive: true });
  const labDir = path.join(root, 'lab');
  const labKeep = new Set(Object.keys(out).filter((k) => /^lab\/[^/]+\/index\.html$/.test(k)).map((k) => k.split('/')[1]));
  for (const d of readdirSync(labDir, { withFileTypes: true })) if (d.isDirectory() && !labKeep.has(d.name)) rmSync(path.join(labDir, d.name), { recursive: true });
  for (const [rel, body] of Object.entries(out)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  console.log(`Wrote ${Object.keys(out).length} files.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
