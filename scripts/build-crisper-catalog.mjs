// Builds the Crisper Tracker catalog from the Storage Guide's produce data.
//
//   node scripts/build-crisper-catalog.mjs
//
// Writes two files that must be committed:
//   api/_crisper/catalog.js  — server copy (imported by the API and receipt parser)
//   crisper/catalog.json     — browser copy (the "add produce" picker)
//
// Re-run whenever seasonal/produce.json changes so shelf-life windows, tips and
// Krisp estimates never drift from what the guide tells people.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { KRISP, NO_KRISP, EVIDENCE } from './krisp-tiers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const produce = JSON.parse(readFileSync(path.join(root, 'seasonal/produce.json'), 'utf8'));

// Receipt wording -> guide item. Plurals are generated automatically, so list
// singular forms only. The parser takes the LONGEST alias that matches a line,
// which is how "green onion" beats "onion" and "grape tomato" beats "grape".
const ALIASES = {
  Apple: ['apple', 'honeycrisp', 'gala apple', 'fuji apple', 'granny smith', 'pink lady', 'envy apple',
    'cosmic crisp', 'jazz apple', 'ambrosia apple', 'red delicious', 'golden delicious', 'braeburn', 'mcintosh'],
  Avocado: ['avocado', 'hass avocado'],
  Banana: ['banana'],
  Blueberry: ['blueberry'],
  Cantaloupe: ['cantaloupe', 'muskmelon'],
  Cherry: ['cherry', 'bing cherry', 'rainier cherry'],
  Grape: ['grape', 'red grape', 'green grape', 'seedless grape', 'cotton candy grape'],
  Kiwi: ['kiwi', 'kiwifruit', 'kiwi fruit'],
  Lemon: ['lemon', 'meyer lemon'],
  Lime: ['lime', 'key lime'],
  Mango: ['mango', 'ataulfo mango', 'honey mango'],
  Orange: ['orange', 'navel orange', 'cara cara', 'blood orange', 'valencia orange'],
  Peach: ['peach'],
  Pear: ['pear', 'bartlett', 'bosc', 'anjou', 'd\'anjou'],
  Pineapple: ['pineapple'],
  Plum: ['plum', 'pluot'],
  Strawberry: ['strawberry'],
  Tomato: ['tomato', 'roma tomato', 'cherry tomato', 'grape tomato', 'heirloom tomato', 'tomatoes on the vine', 'tomato on the vine', 'beefsteak tomato', 'campari tomato'],
  Watermelon: ['watermelon'],
  Nectarine: ['nectarine'],
  Papaya: ['papaya'],
  Pomegranate: ['pomegranate', 'pomegranate aril'],
  Asparagus: ['asparagus'],
  'Bell Pepper': ['bell pepper', 'red pepper', 'green pepper', 'yellow pepper', 'orange pepper', 'sweet pepper', 'mini sweet pepper', 'red bell', 'green bell'],
  Broccoli: ['broccoli', 'broccoli crown', 'broccoli floret', 'broccolini'],
  'Brussels Sprouts': ['brussels sprout', 'brussel sprout'],
  Cabbage: ['cabbage', 'napa cabbage', 'red cabbage', 'green cabbage', 'savoy cabbage', 'coleslaw mix'],
  Carrot: ['carrot', 'baby carrot', 'rainbow carrot'],
  Cauliflower: ['cauliflower', 'cauliflower floret'],
  Celery: ['celery', 'celery heart'],
  Corn: ['corn', 'sweet corn', 'corn on the cob', 'ear of corn', 'bicolor corn'],
  Cucumber: ['cucumber', 'english cucumber', 'mini cucumber', 'persian cucumber'],
  Eggplant: ['eggplant'],
  Garlic: ['garlic', 'garlic bulb'],
  'Green Beans': ['green bean', 'string bean', 'haricot vert', 'french bean'],
  Kale: ['kale', 'lacinato kale', 'curly kale', 'baby kale'],
  Lettuce: ['lettuce', 'romaine', 'romaine heart', 'iceberg', 'butter lettuce', 'butterhead', 'green leaf', 'red leaf', 'little gem'],
  Mushroom: ['mushroom', 'cremini', 'baby bella', 'portobello', 'portabella', 'shiitake', 'oyster mushroom'],
  Onion: ['onion', 'yellow onion', 'red onion', 'white onion', 'sweet onion', 'vidalia', 'shallot'],
  Peas: ['pea', 'snap pea', 'sugar snap', 'snow pea', 'english pea', 'sugar snap pea'],
  Potato: ['potato', 'russet', 'yukon gold', 'red potato', 'gold potato', 'fingerling', 'baby potato', 'petite potato'],
  Spinach: ['spinach', 'baby spinach'],
  'Sweet Potato': ['sweet potato', 'yam'],
  Zucchini: ['zucchini', 'yellow squash', 'summer squash', 'courgette'],
  'Herbs (Fresh)': ['fresh herb', 'mint', 'dill', 'thyme', 'rosemary', 'chive', 'sage', 'oregano', 'tarragon'],
  Radish: ['radish'],
  'Squash (Winter)': ['butternut squash', 'acorn squash', 'spaghetti squash', 'delicata squash', 'kabocha', 'winter squash', 'butternut'],
  Grapefruit: ['grapefruit'],
  Apricot: ['apricot'],
  Honeydew: ['honeydew', 'honeydew melon'],
  Raspberry: ['raspberry'],
  Blackberry: ['blackberry'],
  'Jalapeño': ['jalapeno', 'jalapeño', 'serrano pepper'],
  Cranberry: ['cranberry', 'fresh cranberry'],
  Fig: ['fig', 'mission fig'],
  'Green Onion': ['green onion', 'scallion', 'spring onion'],
  Mandarin: ['mandarin', 'clementine', 'cutie', 'halo mandarin', 'tangerine', 'satsuma', 'tangelo'],
  Cilantro: ['cilantro'],
  Parsley: ['parsley', 'italian parsley', 'curly parsley'],
  Basil: ['basil', 'thai basil'],
  'Bagged Salad': ['spring mix', 'salad mix', 'mixed greens', 'baby greens', 'salad kit', 'salad blend', 'bagged salad', 'power greens', 'baby lettuce', 'garden salad', 'salad greens'],
  'Bok Choy': ['bok choy', 'baby bok choy', 'bok choi', 'pak choi', 'pak choy'],
  'Collard Greens': ['collard', 'collard green'],
  'Swiss Chard': ['chard', 'swiss chard', 'rainbow chard', 'beet green'],
  Arugula: ['arugula', 'baby arugula'],
  'Mustard Greens': ['mustard green', 'turnip green'],
  Beet: ['beet'],
  Ginger: ['ginger', 'ginger root'],
  Leek: ['leek'],
  Artichoke: ['artichoke'],
  Pumpkin: ['pumpkin', 'pie pumpkin', 'sugar pumpkin'],
  Okra: ['okra'],
  Plantain: ['plantain', 'platano'],
  Tomatillo: ['tomatillo'],
  Persimmon: ['persimmon', 'fuyu', 'hachiya'],
  Parsnip: ['parsnip'],
  Turnip: ['turnip'],
  Fennel: ['fennel'],
};

// The guide's shelfLife strings are written for people. Pull the window that
// matches where the item is stored; overrides cover the few strings that list
// more than one storage location.
const OVERRIDES = {
  Pineapple: [5, 7], // "3-5 days (counter), 5-7 days (refrigerated)" — tracked in the fridge
};
const UNIT = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30 };
function windowFor(item) {
  if (OVERRIDES[item.name]) return OVERRIDES[item.name];
  const m = String(item.shelfLife).match(/(\d+)\s*(?:-\s*(\d+))?\s*(days?|weeks?|months?)/i);
  if (!m) throw new Error(`Cannot parse shelf life for ${item.name}: ${item.shelfLife}`);
  const k = UNIT[m[3].toLowerCase()];
  const lo = Number(m[1]) * k;
  const hi = Number(m[2] || m[1]) * k;
  return [lo, hi];
}

function parseRange(r, fallback) {
  if (!r) return fallback ? [fallback, fallback] : [0, 0];
  const m = String(r).match(/(\d+)\s*[–-]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [fallback || 0, fallback || 0];
}

const names = new Set(produce.map((p) => p.name));
for (const k of Object.keys(ALIASES)) if (!names.has(k)) throw new Error(`Alias key not in guide: ${k}`);
for (const n of names) if (!ALIASES[n]) throw new Error(`Guide item has no aliases: ${n}`);
for (const k of [...Object.keys(KRISP), ...Object.keys(NO_KRISP)]) if (!names.has(k)) throw new Error(`Krisp key not in guide: ${k}`);

const catalog = produce.map((p) => {
  const [minDays, maxDays] = windowFor(p);
  const krisp = p.extraDays > 0 ? parseRange(p.extraDaysRange, p.extraDays) : [0, 0];
  return {
    name: p.name,
    category: p.category,
    emoji: p.emoji,
    imageUrl: p.imageUrl,
    storage: p.storageLocation,
    shelfLifeText: p.shelfLife,
    minDays,
    maxDays,
    ripensFirst: p.storageLocation === 'counter_then_fridge',
    krispRecommended: !!KRISP[p.name] && krisp[1] > 0,
    krispExtra: KRISP[p.name] ? krisp : [0, 0],
    krispTier: KRISP[p.name] && krisp[1] > 0 ? KRISP[p.name][0] : null,
    krispPrevents: KRISP[p.name] ? KRISP[p.name][1] : '',
    krispEvidence: KRISP[p.name] ? (EVIDENCE[p.evidence] || '') : '',
    krispNoBenefit: KRISP[p.name] ? '' : (NO_KRISP[p.name] || p.noBenefitReason || ''),
    ethyleneProduction: p.ethyleneProduction,
    ethyleneSensitivity: p.ethyleneSensitivity,
    avoidWith: p.avoidWith || [],
    tip: (p.storageTips || [])[0] || '',
    ripeTip: p.ripeTip || '',
    aliases: ALIASES[p.name],
  };
});

const banner = '// GENERATED by scripts/build-crisper-catalog.mjs from seasonal/produce.json — do not edit by hand.\n';
writeFileSync(path.join(root, 'api/_crisper/catalog.js'), `${banner}export const CATALOG = ${JSON.stringify(catalog, null, 1)};\n`);
writeFileSync(path.join(root, 'crisper/catalog.json'), JSON.stringify(catalog.map(({ aliases, ...rest }) => rest)));
console.log(`catalog: ${catalog.length} items`);
for (const c of catalog) console.log(`${c.name.padEnd(18)} ${String(c.minDays).padStart(3)}-${String(c.maxDays).padEnd(4)} ${c.storage}${c.krispTier ? `  krisp ${c.krispTier} +${c.krispExtra.join('–')}` : ''}`);
