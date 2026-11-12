// Builds the "Why it goes bad" pages from data/spoilage.json.
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
<meta property="og:site_name" content="SimplyKrisp Produce Guide" />
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
  <a class="brand" href="/"><div><div class="name">SimplyKrisp</div><div class="sub">Produce Guide</div></div></a>
  <nav><a href="/">Storage Guide</a><a href="/produce">Why It Goes Bad</a><a href="/seasonal">In Season</a><a href="/lab">Lab Notebook</a><a class="shop" href="https://simplykrisp.com/?${utm('header')}" target="_blank" rel="noopener">Shop</a></nav>
</div></header>
`;
}

function foot(year) {
  return `<footer><div class="wrap">
  <p><strong>Food safety:</strong> These pages describe quality and common spoilage. They are not a substitute for your own judgment. If something smells wrong, is slimy, or is moldy on soft produce, throw it out. Mold guidance follows <a href="https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/molds-food-are-they-dangerous" target="_blank" rel="noopener">USDA FSIS</a>, and spoilage causes come mainly from the <a href="https://postharvest.ucdavis.edu/produce-facts-sheets" target="_blank" rel="noopener">UC Davis Postharvest Center</a>.</p>
  <p class="fine">&copy; ${year} SimplyKrisp. 1% for the Planet member.</p>
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

const verdictTag = (v, verdicts) => `<span class="verdict v-${v}">${esc(verdicts[v].label)}</span>`;
const causeTag = (c, causes) => `<span class="cause">${esc(causes[c].label)}</span>`;

// ---------- item page ----------

function itemPage(item, ctx) {
  const { spoilage, byName, runs } = ctx;
  const { causes, verdicts, sources } = spoilage;
  const p = byName[item.name];
  const scraps = SCRAPS[item.name];
  const lab = labRunsFor(item, runs);
  const pathname = `/produce/${item.slug}`;
  const Title = item.display.charAt(0).toUpperCase() + item.display.slice(1);
  const title = `Why ${item.display} go${item.display.endsWith('s') ? '' : 'es'} bad, and what to do | SimplyKrisp`;
  const desc = `${item.failures.map((f) => f.title.toLowerCase()).slice(0, 3).join(', ')}: what causes it, whether it's still OK to eat, and how to prevent it next time.`;
  const trail = [['Produce Guide', '/'], ['Why It Goes Bad', '/produce'], [Title, pathname]];

  // Number sources in order of first use on the page.
  const order = [];
  for (const f of item.failures) for (const s of f.sources) if (!order.includes(s)) order.push(s);
  const ref = (s) => `<a class="ref" href="#src-${s}" aria-label="Source ${order.indexOf(s) + 1}">${order.indexOf(s) + 1}</a>`;

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: item.failures.map((f) => ({
      '@type': 'Question',
      name: `${Title}: ${f.title.toLowerCase()}. Is it still OK to eat?`,
      acceptedAnswer: { '@type': 'Answer', text: `${f.verdictNote} Why it happens: ${f.why}` },
    })),
  };

  const chips = item.failures.map((f) => `<a class="chip" href="#${f.id}">${esc(f.title)}</a>`).join('');

  const cards = item.failures.map((f, i) => {
    const krisp = f.krispHelps && p.krispBenefit
      ? `<div class="krisp"><span class="lbl">Where a Krisp fits</span><p>${esc(p.krispBenefit)} <a href="${SHOP}?${utm(item.slug + '-' + f.id)}" target="_blank" rel="noopener">See the Double Krisp</a></p></div>`
      : '';
    const rescue = f.rescue.length
      ? `<div class="blk"><span class="lbl">Use it up</span><ul>${f.rescue.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`
      : '';
    return `<article class="fail" id="${f.id}">
  <div class="fhead"><span class="num">${i + 1}</span><h2>${esc(f.title)}</h2></div>
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

  const avoid = (p.avoidWith || []).filter(Boolean);
  const facts = `<dl class="facts">
  <div><dt>Where to keep it</dt><dd>${esc(where[p.storageLocation] || p.storageLocation)}</dd></div>
  <div><dt>How long it lasts</dt><dd>${esc(p.shelfLife)}</dd></div>
  <div><dt>Keep it away from</dt><dd>${avoid.length ? esc(list(avoid)) : 'Nothing in particular'}</dd></div>
</dl>`;

  const anyKrisp = item.failures.some((f) => f.krispHelps);
  const noKrisp = !anyKrisp && (p.noBenefitReason || p.krispBenefit)
    ? `<p class="aside"><strong>Does a Krisp help?</strong> ${esc(p.noBenefitReason || p.krispBenefit)}</p>`
    : '';

  const storage = `<section class="sec" id="storage"><h2>How to store ${esc(item.display)}</h2>
  <ul class="tips">${p.storageTips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${noKrisp}
  <p class="more">Full storage details are in the <a href="/">Produce Storage Guide</a>.</p></section>`;

  const scrapSec = scraps ? `<section class="sec" id="scraps"><h2>The part people throw away</h2>
  <p>About ${scraps.pct}% of ${esc(item.display)} by weight is usually trimmed off as ${esc(scraps.part)} (USDA FoodData Central). Some of it can still be used:</p>
  <ul class="tips">${scraps.ideas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : '';

  const labSec = lab.length ? `<section class="sec" id="lab"><h2>From the Lab Notebook</h2>
  ${lab.map((r) => `<a class="labrun" href="/lab#${esc(r.id)}"><span class="badge b-${r.status === 'complete' ? 'done' : r.status === 'in progress' ? 'live' : 'planned'}">${esc(r.status)}</span><b>${esc(r.title)}</b><span>${esc(r.result)}</span></a>`).join('')}
  <p class="more">Home tests in one refrigerator, published as they happen, including the ones that show no difference.</p></section>` : '';

  const srcSec = `<section class="sec" id="sources"><h2>Sources</h2><ol class="srcs">${order
    .map((s) => `<li id="src-${s}"><a href="${esc(sources[s].url)}" target="_blank" rel="noopener">${esc(sources[s].title)}</a>, ${esc(sources[s].publisher)}</li>`)
    .join('')}</ol></section>`;

  const others = ctx.items.filter((o) => o.slug !== item.slug).map((o) => `<a href="/produce/${o.slug}"><img src="${esc(ctx.byName[o.name].imageUrl)}" alt="" width="24" height="24" loading="lazy" />${esc(o.name === 'Herbs (Fresh)' ? 'Fresh herbs' : o.name)}</a>`).join('');

  return head({ title, desc, pathname, jsonld: [crumbLd(trail), faq] }) + `
<main class="wrap">
  ${crumbs(trail)}
  <section class="hero">
    <div class="ttl"><img src="${esc(p.imageUrl)}" alt="" width="56" height="56" /><div>
      <div class="eyebrow"><span class="dot"></span> Why it goes bad</div>
      <h1>${esc(Title)}: what went wrong, and what to do</h1>
    </div></div>
    <p class="lede">${esc(item.intro)}</p>
    ${facts}
    <div class="jump"><span class="lbl">What are you seeing?</span><div class="chips">${chips}</div></div>
  </section>

  <section class="fails" aria-label="Ways ${esc(item.display)} go bad">
${cards}
  </section>

  <div class="lookup-band"><p>Not sure what you're looking at? Pick the produce and the symptom.</p><a class="btn" href="/produce/what-went-wrong?item=${item.slug}">What went wrong?</a></div>

  ${storage}
  ${scrapSec}
  ${labSec}
  ${srcSec}

  <section class="sec others"><h2>Other produce</h2><div class="olist">${others}</div></section>
</main>
` + foot(ctx.spoilage.meta.updated.slice(0, 4));
}

// ---------- index ----------

function indexPage(ctx) {
  const { items, byName, spoilage } = ctx;
  const trail = [['Produce Guide', '/'], ['Why It Goes Bad', '/produce']];
  const title = 'Why produce goes bad, and what to do about it | SimplyKrisp';
  const desc = 'Yellow broccoli, slimy spinach, black basil, moldy berries: what causes each one, whether it is still safe to eat, and how to stop it happening again.';
  const totalFails = items.reduce((n, i) => n + i.failures.length, 0);
  const causeCounts = {};
  for (const it of items) for (const f of it.failures) causeCounts[f.cause] = (causeCounts[f.cause] || 0) + 1;
  const topCauses = Object.entries(causeCounts).sort((a, b) => b[1] - a[1]);

  const cards = items.map((it) => {
    const p = byName[it.name];
    const nm = it.name === 'Herbs (Fresh)' ? 'Fresh herbs' : it.name;
    return `<article class="icard">
  <a class="ihead" href="/produce/${it.slug}"><img src="${esc(p.imageUrl)}" alt="" width="36" height="36" loading="lazy" /><h2>${esc(nm)}</h2></a>
  <ul>${it.failures.map((f) => `<li><a href="/produce/${it.slug}#${f.id}">${esc(f.title)}</a>${verdictTag(f.verdict, spoilage.verdicts)}</li>`).join('')}</ul>
</article>`;
  }).join('\n');

  const causes = topCauses.map(([c, n]) => `<li><b>${esc(spoilage.causes[c].label)}</b><span>${esc(spoilage.causes[c].blurb)}</span><em>${n} of ${totalFails}</em></li>`).join('');

  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/produce/${it.slug}`, name: it.name })),
  };

  return head({ title, desc, pathname: '/produce', jsonld: [crumbLd(trail), itemList] }) + `
<main class="wrap">
  ${crumbs(trail)}
  <section class="hero">
    <div class="eyebrow"><span class="dot"></span> Why it goes bad</div>
    <h1>Why produce goes bad, and what to do about it</h1>
    <p class="lede">Storage tips tell you how to keep produce fresh. This is for when it didn't work. Find what you're looking at, learn what caused it, and see whether it's still good to eat. Most of the time it is.</p>
    <div class="cta-row"><a class="btn" href="/produce/what-went-wrong">What went wrong? Pick a symptom</a><a class="btn ghost" href="/">Storage Guide</a></div>
  </section>

  <section class="igrid" aria-label="Produce">
${cards}
  </section>
  <p class="more">${items.length} of the ${ctx.produce.length} items in the Storage Guide so far, starting with the produce people throw away most.</p>

  <section class="sec"><h2>The usual causes</h2><p>Across these ${items.length} items, here's how often each cause shows up. Ethylene is only part of the picture, which is why storage habits matter as much as any product.</p><ul class="causes">${causes}</ul></section>
</main>
` + foot(ctx.spoilage.meta.updated.slice(0, 4));
}

// ---------- symptom lookup ----------

function lookupPage(ctx) {
  const { items, byName, spoilage } = ctx;
  const trail = [['Produce Guide', '/'], ['Why It Goes Bad', '/produce'], ['What went wrong?', '/produce/what-went-wrong']];
  const title = 'What went wrong with my produce? Symptom checker | SimplyKrisp';
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
` + foot(ctx.spoilage.meta.updated.slice(0, 4));
}

// ---------- sitemap ----------

function sitemap(ctx) {
  const today = ctx.spoilage.meta.updated;
  const urls = ['/', '/seasonal', '/lab', '/lab/crisper-map', '/produce', '/produce/what-went-wrong', ...ctx.items.map((i) => `/produce/${i.slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc>${u.startsWith('/produce') ? `<lastmod>${today}</lastmod>` : ''}</url>`).join('\n')}
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
  const out = {
    'produce/index.html': indexPage(ctx),
    'produce/what-went-wrong/index.html': lookupPage(ctx),
    'sitemap.xml': sitemap(ctx),
    'robots.txt': ROBOTS,
    // Lets /seasonal link each card to its page without duplicating the list.
    'produce/pages.json': JSON.stringify(Object.fromEntries(ctx.items.map((i) => [i.name, i.slug])), null, 2) + '\n',
  };
  for (const it of ctx.items) out[`produce/${it.slug}/index.html`] = itemPage(it, ctx);
  return out;
}

function main() {
  const out = render();
  // Remove item folders that no longer exist in the data.
  const dir = path.join(root, 'produce');
  const keep = new Set(Object.keys(out).map((k) => k.split('/')[1]));
  if (existsSync(dir)) for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory() && !keep.has(d.name)) rmSync(path.join(dir, d.name), { recursive: true });
  for (const [rel, body] of Object.entries(out)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  console.log(`Wrote ${Object.keys(out).length} files.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
