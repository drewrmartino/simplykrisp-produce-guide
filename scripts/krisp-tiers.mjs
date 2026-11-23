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
// The old extraDays / extraDaysRange / krispExtra day estimates were removed
// from every output in Nov 2026; dev/krisp-claims.test.mjs fails if they return.
//
// Each entry: [tier, what ethylene does to it, source]. The effect is one
// sentence. The source is the item's own entry in a published table or
// handbook (never a "closely related" crop and never our own read), with the
// gist of what it says (paraphrased, not a quote). Every item here must have one: dev/krisp-claims.test.mjs fails
// otherwise.
//
// Nov 2026 review: Green Onion and Celery were removed. UC Davis says green
// onions "are not sensitive to external ethylene", and celery only loses its
// green at 10 ppm or more above 41°F, which a home drawer does not reach.
// Nov 23 2026 source review: every item now cites its own USDA Handbook 66
// chapter (or the UC Davis fact sheet for peas). Pear and Avocado moved to
// ethylene producers: Handbook 66 says that once a climacteric fruit is
// ripening, "lowering its external concentration has an insignificant effect"
// (Ethylene Effects, PDF page 88). Bok Choy was removed: its Handbook 66 chapter says it "is not
// overly sensitive to ethylene".
export const HB66 = 'https://www.ars.usda.gov/arsuserfiles/oc/np/commercialstorage/commercialstorage.pdf';
const hb = (chapter, page, note) => ({ name: `USDA Agriculture Handbook 66 (2016), ${chapter}`, url: `${HB66}#page=${page}`, note });
export const KRISP = {
  Broccoli: ['strong', 'Ethylene speeds the florets yellowing.',
    hb('Broccoli', 259, 'Broccoli is extremely sensitive to ethylene, with floret yellowing being the most prevalent symptom.')],
  Lettuce: ['strong', 'Ethylene speeds russet spotting, the brown specks on romaine and leaf lettuce.',
    hb('Lettuce', 398, 'Exposure to ethylene can result in damage such as russet spotting and leaf yellowing.')],
  Spinach: ['strong', 'Ethylene speeds the leaves yellowing.',
    hb('Greens, leafy (collards, kale, spinach, mustard)', 364, 'All leafy greens are sensitive to ethylene, which accelerates senescence and leaf yellowing.')],
  Kale: ['strong', 'Ethylene speeds the leaves yellowing.',
    hb('Greens, leafy (collards, kale, spinach, mustard)', 364, 'All leafy greens are sensitive to ethylene, which accelerates senescence and leaf yellowing.')],
  Cabbage: ['strong', 'Ethylene speeds the outer leaves yellowing and loosening from the head.',
    hb('Cabbage', 267, 'Ethylene as low as 1 ppm accelerates senescence and quality loss, such as leaf yellowing, wilting and abscission.')],
  Cucumber: ['strong', 'Ethylene speeds yellowing and decay.',
    hb('Cucumber', 313, 'Cucumbers are very sensitive to ethylene. Exposure to 1 to 5 ppm accelerates yellowing and decay.')],
  'Brussels Sprouts': ['strong', 'Ethylene speeds the outer leaves yellowing.',
    hb('Brussels Sprouts', 263, 'Brussels sprouts are extremely sensitive to ethylene, with leaf yellowing and abscission being the most prevalent symptoms.')],
  Cauliflower: ['strong', 'Ethylene speeds browning on the head and yellowing leaves.',
    hb('Cauliflower', 282, 'Cauliflower is extremely sensitive to ethylene, with curd discoloration and leaf yellowing and abscission.')],
  Carrot: ['strong', 'Ethylene can give carrots a bitter taste.',
    hb('Carrots', 275, 'Exposure to ethylene (about 0.2 ppm) induces the bitter compound isocoumarin.')],
  Kiwi: ['strong', 'Ethylene speeds kiwi softening, even in the cold.',
    hb('Kiwifruit', 384, 'Kiwifruit in storage are extremely sensitive to ethylene; as little as 5 to 10 ppb can accelerate softening.')],
  Asparagus: ['some', 'Ethylene speeds the spears turning tough and woody.',
    hb('Asparagus', 221, 'Exposure to ethylene accelerated the lignification (toughening) of asparagus spears.')],
  'Green Beans': ['some', 'Ethylene speeds yellowing and browning.',
    hb('Beans', 241, 'Ethylene above 0.1 ppm promotes chlorophyll loss and increases browning in green beans.')],
  Peas: ['some', 'Ethylene speeds the pods yellowing.',
    { name: 'UC Davis Postharvest Center, Snow & Snap Pea Pods', url: 'https://postharvest.ucdavis.edu/produce-facts-sheets/peas-snow-and-snap-pod', note: 'Peas are moderately sensitive to exogenous ethylene. Accelerated yellowing and decay will result from extended exposure to low levels.' }],
  Eggplant: ['some', 'Ethylene speeds browning and loosens the green cap.',
    hb('Eggplant', 334, 'Eggplant has a moderate to high sensitivity to ethylene; calyx abscission and browning may result.')],
  Zucchini: ['some', 'Ethylene can turn the skin yellow.',
    hb('Summer Squash', 567, 'Increased yellowing may result if green-skinned summer squash are exposed to ethylene.')],
  'Collard Greens': ['some', 'Ethylene speeds the leaves yellowing.',
    hb('Greens, leafy (collards, kale, spinach, mustard)', 364, 'All leafy greens are sensitive to ethylene, which accelerates senescence and leaf yellowing.')],
  'Mustard Greens': ['some', 'Ethylene speeds the leaves yellowing.',
    hb('Greens, leafy (collards, kale, spinach, mustard)', 364, 'All leafy greens are sensitive to ethylene, which accelerates senescence and leaf yellowing.')],
  Arugula: ['some', 'Ethylene speeds the leaves yellowing.',
    hb('Salad Greens (including arugula)', 549, 'Salad greens are highly sensitive to ethylene exposure, which typically results in yellowing of leaves.')],
  'Swiss Chard': ['some', 'Ethylene speeds the leaves yellowing.',
    hb('Swiss Chard', 581, 'Sensitivity to ethylene is very high. Exposure results in yellowing and senescence.')],
  Leek: ['some', 'Ethylene speeds softening and decay.',
    hb('Leeks', 390, 'Leeks are moderately sensitive to ethylene. Detrimental effects include softening and increased decay.')],
  Persimmon: ['some', 'Ethylene speeds firm persimmons going soft.',
    hb('Persimmon', 498, 'Persimmons are very sensitive to ethylene, which accelerates softening.')],
  Parsnip: ['some', 'Ethylene can give parsnips a bitter taste.',
    hb('Parsnips', 467, 'Exposure to low levels of ethylene in cold storage causes bitterness.')],
};
// Strong ethylene producers: store them apart from sensitive produce. A Krisp
// note never goes on these (krispNoBenefit says why instead).
export const PRODUCERS = {
  Apple: hb('Apples', 187, 'The apple is a climacteric fruit with autocatalytic ethylene production.'),
  Pear: hb('Pears', 483, 'Most pear cultivars show climacteric-like ethylene production during ripening.'),
  Avocado: hb('Avocado', 230, 'Ripe avocados produce more than 100 µL/kg/h ethylene and should not be stored with ethylene-sensitive produce.'),
  Cantaloupe: hb('Netted Melon', 434, 'Netted melons are climacteric fruit that produce ethylene as they ripen.'),
};

// Companion notes (Nov 2026, approved by Drew). Producers stay
// krispRecommended false: the note is about protecting the greens next to
// them, never the fruit itself. Sensitive items get one line on when a Krisp
// matters most. Source: household fridges averaged 0.20 ppm ethylene with
// apples inside vs 0.029 ppm without (Warton, Wills & Ku 2000).
export const PRODUCER_NOTE = 'Ethylene producer. Best stored apart from greens. If they share a drawer, a Krisp helps protect the greens and broccoli nearby.';
export const NEARBY_NOTE = 'Most helpful when apples or pears are nearby.';
export const FRIDGE_SOURCE = {
  name: 'Warton, Wills & Ku 2000, household fridge ethylene (CSIRO)',
  url: 'https://www.publish.csiro.au/an/ea99125',
  note: 'Home fridges averaged 0.20 ppm ethylene with apples inside and 0.029 ppm without.',
};
// What a Krisp does, the same everywhere. Never add a day count or a strength word.
export const KRISP_HOW = 'A Krisp absorbs ethylene in a closed crisper drawer, which matters most when apples, pears or bananas share the fridge.';
export const KRISP_CHIP = 'Ethylene-sensitive';
// Why a Krisp won't help, for items people might expect it to. Items not listed
// here keep the noBenefitReason already in seasonal/produce.json.
export const NO_KRISP = {
  Apple: 'Apples are one of the biggest ethylene sources in the fridge. Store them apart from greens and other sensitive produce instead.',
  Pear: 'Pears give off ethylene as they ripen, and once a pear is ripening, less ethylene around it changes little. Store ripe pears apart from greens and other sensitive produce instead.',
  Avocado: 'Ripe avocados give off a lot of ethylene, and once one is ripening, less ethylene around it changes little. Store ripe avocados apart from greens and other sensitive produce instead.',
  'Bok Choy': 'Bok choy is not very sensitive to ethylene, so it gets no Krisp note. Keep it cold and bagged in the high-humidity drawer.',
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
// Where the ethylene evidence for an item comes from: its own source, cited.
export function evidenceFor(name) {
  const t = KRISP[name];
  return t ? { text: t[2].note, source: t[2].name, url: t[2].url } : null;
}

// One plain sentence set for the Storage Guide, /seasonal and /produce.
// No day counts and no strength claims (see the claims note above).
export function benefitText(name) {
  const t = KRISP[name];
  if (!t) return '';
  return `${t[1]} ${KRISP_HOW}`;
}
