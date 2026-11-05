// Single source of truth for where a Krisp helps. Used by:
//   scripts/build-crisper-catalog.mjs  -> My Krisper catalog
//   scripts/apply-krisp-tiers.mjs      -> Storage Guide bundle + /seasonal produce.json

// Where a Krisp truly helps in a home fridge. The guide lists a Krisp estimate
// for 28 items; this narrows it to items that (1) react strongly to ethylene and
// (2) sit in a closed crisper drawer, where the sachet is. "strong" = high
// sensitivity + common waste; "some" = moderate sensitivity, or ripe fruit
// moved to the drawer. Day ranges still come from the guide.
export const KRISP = {
  Broccoli: ['strong', 'Keeps the florets green instead of yellowing.'],
  Lettuce: ['strong', 'Slows russet spotting, the brown specks on romaine and leaf lettuce.'],
  Spinach: ['strong', 'Slows the leaves yellowing.'],
  Kale: ['strong', 'Slows the leaves yellowing.'],
  Cabbage: ['strong', 'Slows outer leaves yellowing and loosening from the head.'],
  Cucumber: ['strong', 'Slows yellowing and soft, watery spots.'],
  'Brussels Sprouts': ['strong', 'Keeps the outer leaves from yellowing.'],
  Cauliflower: ['strong', 'Slows browning on the head and yellowing leaves.'],
  Carrot: ['strong', 'Stops the bitter taste carrots pick up from ethylene.'],
  'Green Onion': ['strong', 'Slows the green tops yellowing.'],
  Kiwi: ['strong', 'Ripe kiwi turns mushy fast around ethylene. This slows the softening.'],
  Asparagus: ['some', 'Slows the spears turning tough and woody.'],
  Celery: ['some', 'Helps the stalks keep their green color.'],
  'Green Beans': ['some', 'Slows yellowing and browning.'],
  Peas: ['some', 'Slows the pods yellowing.'],
  Eggplant: ['some', 'Slows browning at the cap and softening.'],
  Zucchini: ['some', 'Slows yellowing and soft spots.'],
  Avocado: ['some', 'Once ripe and chilled, slows it going from ripe to overripe.'],
  Pear: ['some', 'Once ripe and chilled, slows it going soft and mealy.'],
};
// Items the guide estimated a Krisp benefit for that we no longer claim.
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
