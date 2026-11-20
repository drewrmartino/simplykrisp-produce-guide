// Single source of truth for which items get a Krisp note. Used by:
//   scripts/build-crisper-catalog.mjs  -> My Krisper catalog
//   scripts/apply-krisp-tiers.mjs      -> Storage Guide bundle + /seasonal produce.json

// Ethylene-sensitive items that get a Krisp note: items that (1) have published
// evidence of ethylene damage at home-fridge temperatures and (2) sit in a
// closed crisper drawer, where the sachet is. "strong" = high sensitivity +
// common waste; "some" = moderate sensitivity or ripe fruit moved to the drawer.
// The tier only orders lists; it is never shown as a strength claim.
//
// Claims (Nov 2026, produce-manager/claims-ledger.csv): there is no household
// test of the Krisp sachet, so no surface may say how many days it adds or how
// much it helps. What is supported: KMnO4 removes ethylene in a closed drawer
// (https://journals.ashs.org/jashs/view/journals/jashs/129/3/article-p433.pdf);
// lower ethylene extends storage life of many vegetables in general
// (https://www.publish.csiro.au/an/EA98123); home fridges reach about 0.20 ppm
// ethylene with apples vs 0.03 ppm without, so it matters most when apples,
// pears or bananas share the fridge (https://www.publish.csiro.au/an/ea99125).
// extraDays / extraDaysRange in seasonal/produce.json are legacy data and are
// not rendered anywhere.
//
// Each entry: [tier, what ethylene does to it]. The second part is one sentence.
//
// Nov 2026 review: Green Onion and Celery were removed. UC Davis says green
// onions "are not sensitive to external ethylene", and celery only loses its
// green at 10 ppm or more above 41°F, which a home drawer does not reach.
export const KRISP = {
  Broccoli: ['strong', 'Ethylene speeds the florets yellowing.'],
  Lettuce: ['strong', 'Ethylene speeds russet spotting, the brown specks on romaine and leaf lettuce.'],
  Spinach: ['strong', 'Ethylene speeds the leaves yellowing.'],
  Kale: ['strong', 'Ethylene speeds the leaves yellowing.'],
  Cabbage: ['strong', 'Ethylene speeds the outer leaves yellowing and loosening from the head.'],
  Cucumber: ['strong', 'Ethylene speeds yellowing and soft, watery spots.'],
  'Brussels Sprouts': ['strong', 'Ethylene speeds the outer leaves yellowing.'],
  Cauliflower: ['strong', 'Ethylene speeds browning on the head and yellowing leaves.'],
  Carrot: ['strong', 'Ethylene can give carrots a bitter taste.'],
  Kiwi: ['strong', 'Ethylene speeds ripe kiwi turning mushy.'],
  Asparagus: ['some', 'Ethylene speeds the spears turning tough and woody.'],
  'Green Beans': ['some', 'Ethylene speeds yellowing and browning.'],
  Peas: ['some', 'Ethylene speeds the pods yellowing.'],
  Eggplant: ['some', 'Ethylene speeds browning at the cap and softening.'],
  Zucchini: ['some', 'Ethylene speeds yellowing and soft spots.'],
  Avocado: ['some', 'Ethylene speeds a ripe avocado going overripe.'],
  Pear: ['some', 'Ethylene speeds a ripe pear going soft and mealy.'],
  'Bok Choy': ['some', 'Ethylene speeds the leaves yellowing.'],
  'Collard Greens': ['some', 'Ethylene speeds the leaves yellowing.'],
  'Mustard Greens': ['some', 'Ethylene speeds the leaves yellowing.'],
  Arugula: ['some', 'Ethylene speeds the leaves yellowing.'],
  'Swiss Chard': ['some', 'Ethylene speeds the leaves yellowing and browning at the edges.'],
  Leek: ['some', 'Ethylene speeds softening.'],
  Persimmon: ['some', 'Ethylene speeds firm persimmons going soft.'],
  Parsnip: ['some', 'Ethylene can give parsnips a bitter taste.'],
};
// What a Krisp does, the same everywhere. Never add a day count or a strength word.
export const KRISP_HOW = 'A Krisp absorbs ethylene in a closed crisper drawer, which matters most when apples, pears or bananas share the fridge.';
export const KRISP_CHIP = 'Ethylene-sensitive';
// Why a Krisp won't help, for items people might expect it to. Items not listed
// here keep the noBenefitReason already in seasonal/produce.json.
export const NO_KRISP = {
  Strawberry: 'Berries barely react to ethylene. Mold is what ends them, so keep them dry and rinse just before eating.',
  Blueberry: 'Berries barely react to ethylene. Mold is what ends them, so keep them dry and rinse just before eating.',
  Orange: 'Citrus barely reacts to ethylene, so a Krisp won\'t change much. It keeps for weeks in the fridge anyway.',
  Cantaloupe: 'Whole melons ripen on the counter and are too big for the drawer. Once cut, wrap it and eat it within a few days.',
  Honeydew: 'Whole melons ripen on the counter and are too big for the drawer. Once cut, wrap it and eat it within a few days.',
  Watermelon: 'Whole melons are too big for the drawer. Once cut, wrap it and eat it within a few days.',
  Mango: 'Mangoes ripen on the counter, and once ripe they have only a day or two, so they rarely share a drawer with a Krisp.',
  Papaya: 'Papayas ripen on the counter, and once ripe they have only a day or two, so they rarely share a drawer with a Krisp.',
  Peach: 'Peaches ripen on the counter, and once ripe they have only a day or two, so they rarely share a drawer with a Krisp.',
  'Herbs (Fresh)': 'In a jar on the shelf, herbs are out of the Krisp\'s reach. Bagged in the high-humidity drawer instead, they share the drawer with the Krisp, which absorbs ethylene there.',
  Cilantro: 'In a jar on the shelf, cilantro is out of the Krisp\'s reach. Bagged in the high-humidity drawer instead, it shares the drawer with the Krisp, which absorbs ethylene there.',
  Parsley: 'In a jar on the shelf, parsley is out of the Krisp\'s reach. Bagged in the high-humidity drawer instead, it shares the drawer with the Krisp, which absorbs ethylene there.',
  Basil: 'Basil lives on the counter because the fridge blackens it, so it never shares a drawer with a Krisp. It barely reacts to ethylene anyway.',
  'Bagged Salad': 'Bagged salad is cut, washed and sealed, so it runs on its use-by date. Once the bag is open, moisture and bruised edges end it in about two days, and a Krisp won\'t change that.',
  'Green Onion': 'Green onions don\'t react to ethylene from other produce. Warmth and age are what yellow the tops, so keeping them cold and damp does more than a Krisp.',
  Tomato: 'Tomatoes keep their flavor best on the counter, out of reach of a Krisp in the drawer. Ripe ones can move to the fridge for a day or two.',
  Celery: 'Celery only loses its green at high ethylene levels and warm temperatures, well beyond a cold crisper drawer. It mostly fails by drying out, so wrapping it does more than a Krisp.',
};
export const EVIDENCE = {
  measured: 'Published postharvest data show this item reacts to ethylene.',
  related: 'Published data on closely related produce show it reacts to ethylene.',
  estimated: 'Our read of how strongly it is known to react to ethylene.',
};

// One plain sentence set for the Storage Guide, /seasonal and /produce.
// No day counts and no strength claims (see the claims note above).
export function benefitText(name) {
  const t = KRISP[name];
  if (!t) return '';
  return `${t[1]} ${KRISP_HOW}`;
}
