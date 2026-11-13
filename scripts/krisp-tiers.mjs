// Single source of truth for where a Krisp helps. Used by:
//   scripts/build-crisper-catalog.mjs  -> My Krisper catalog
//   scripts/apply-krisp-tiers.mjs      -> Storage Guide bundle + /seasonal produce.json

// Where a Krisp truly helps in a home fridge: items that (1) have published
// evidence of ethylene damage at home-fridge temperatures and (2) sit in a
// closed crisper drawer, where the sachet is. "strong" = high sensitivity +
// common waste; "some" = moderate sensitivity, a narrower effect, or ripe fruit
// moved to the drawer. Day ranges come from seasonal/produce.json.
//
// Nov 2026 review: Green Onion and Celery were removed. UC Davis says green
// onions "are not sensitive to external ethylene", and celery only loses its
// green at 10 ppm or more above 41°F, which a home drawer does not reach.
export const KRISP = {
  Broccoli: ['strong', 'Keeps the florets green instead of yellowing.'],
  Lettuce: ['strong', 'Slows russet spotting, the brown specks on romaine and leaf lettuce.'],
  Spinach: ['strong', 'Slows the leaves yellowing.'],
  Kale: ['strong', 'Slows the leaves yellowing.'],
  Cabbage: ['strong', 'Slows outer leaves yellowing and loosening from the head.'],
  Cucumber: ['strong', 'Slows yellowing and soft, watery spots.'],
  'Brussels Sprouts': ['strong', 'Keeps the outer leaves from yellowing.'],
  Cauliflower: ['strong', 'Slows browning on the head and yellowing leaves.'],
  Carrot: ['strong', 'Helps keep carrots from picking up a bitter taste from ethylene.'],
  Kiwi: ['strong', 'Ripe kiwi turns mushy fast around ethylene. This slows the softening.'],
  Asparagus: ['some', 'Slows the spears turning tough and woody.'],
  'Green Beans': ['some', 'Slows yellowing and browning.'],
  Peas: ['some', 'Slows the pods yellowing.'],
  Eggplant: ['some', 'Slows browning at the cap and softening.'],
  Zucchini: ['some', 'Slows yellowing and soft spots.'],
  Avocado: ['some', 'Once ripe and chilled, slows it going from ripe to overripe.'],
  Pear: ['some', 'Once ripe and chilled, slows it going soft and mealy.'],
  'Bok Choy': ['some', 'Slows the leaves yellowing.'],
  'Collard Greens': ['some', 'Slows the leaves yellowing.'],
  'Mustard Greens': ['some', 'Slows the leaves yellowing.'],
  Arugula: ['some', 'Slows the leaves yellowing.'],
  'Swiss Chard': ['some', 'Slows the leaves yellowing and browning at the edges.'],
  Leek: ['some', 'Slows the softening ethylene causes.'],
  Persimmon: ['some', 'Slows firm persimmons going soft around ethylene.'],
  Parsnip: ['some', 'Helps keep parsnips from picking up a bitter taste from ethylene.'],
};
// Why a Krisp won't help, for items people might expect it to. Items not listed
// here keep the noBenefitReason already in seasonal/produce.json.
export const NO_KRISP = {
  Strawberry: 'Berries barely react to ethylene. Mold is what ends them, so keep them dry and rinse just before eating.',
  Blueberry: 'Berries barely react to ethylene. Mold is what ends them, so keep them dry and rinse just before eating.',
  Orange: 'Citrus barely reacts to ethylene, so a Krisp won\'t change much. It keeps for weeks in the fridge anyway.',
  Cantaloupe: 'Whole melons ripen on the counter and are too big for the drawer. Once cut, wrap it and eat it within a few days.',
  Honeydew: 'Whole melons ripen on the counter and are too big for the drawer. Once cut, wrap it and eat it within a few days.',
  Watermelon: 'Whole melons are too big for the drawer. Once cut, wrap it and eat it within a few days.',
  Mango: 'Mangoes ripen on the counter, and once ripe they have only a day or two. A Krisp adds little.',
  Papaya: 'Papayas ripen on the counter, and once ripe they have only a day or two. A Krisp adds little.',
  Peach: 'Peaches ripen on the counter, and once ripe they have only a day or two. A Krisp adds little.',
  'Herbs (Fresh)': 'In a jar on the shelf, herbs are out of the Krisp\'s reach. Bagged in the high-humidity drawer instead, the Krisp helps keep them from yellowing.',
  Cilantro: 'In a jar on the shelf, cilantro is out of the Krisp\'s reach. Bagged in the high-humidity drawer instead, the Krisp helps keep it from yellowing.',
  Parsley: 'In a jar on the shelf, parsley is out of the Krisp\'s reach. Bagged in the high-humidity drawer instead, the Krisp helps keep it from yellowing.',
  Basil: 'Basil lives on the counter because the fridge blackens it, so it never shares a drawer with a Krisp. It barely reacts to ethylene anyway.',
  'Bagged Salad': 'Bagged salad is cut, washed and sealed, so it runs on its use-by date. Once the bag is open, moisture and bruised edges end it in about two days, and a Krisp won\'t change that.',
  'Green Onion': 'Green onions don\'t react to ethylene from other produce. Warmth and age are what yellow the tops, so keeping them cold and damp does more than a Krisp.',
  Celery: 'Celery only loses its green at high ethylene levels and warm temperatures, well beyond a cold crisper drawer. It mostly fails by drying out, so wrapping it does more than a Krisp.',
};
export const EVIDENCE = {
  measured: 'Based on published postharvest data for this item.',
  related: 'Based on published data for closely related produce.',
  estimated: 'Our estimate from how strongly it reacts to ethylene.',
};

// One plain sentence set for the Storage Guide and /seasonal.
export function benefitText(name, range, storage) {
  const t = KRISP[name];
  if (!t) return '';
  const lead = t[0] === 'strong' ? 'A Krisp makes a real difference here.' : 'A Krisp helps a little here.';
  const where = storage === 'counter_then_fridge' ? 'once it is ripe and in a closed crisper drawer' : 'in a closed crisper drawer';
  return `${lead} ${t[1]} Expect about ${range} extra days ${where}.`;
}
