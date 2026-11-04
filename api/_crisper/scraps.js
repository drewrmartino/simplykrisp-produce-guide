// Trim / byproduct for each catalog item: the part people usually cut off,
// its typical share of purchase weight, and practical ways to use it.
//
// pct = USDA SR Legacy "refuse" percentage (FoodData Central / SR28 FOOD_DES),
// the share of the item as purchased that is normally discarded.
// https://fdc.nal.usda.gov/  (SR28 download: ars.usda.gov, sr28asc.zip)
// Herbs use cilantro; peas use edible-podded; winter squash uses all varieties.

export const SCRAPS = {
  'Apple': { part: 'cores and peels', pct: 10, ideas: ['Simmer cores and peels with a cinnamon stick for a quick syrup or tea', 'Make apple-scrap vinegar: cover with sugar water and let it ferment 2–4 weeks'] },
  'Avocado': { part: 'pit and skin', pct: 26, ideas: ['Sprout the pit in water as a houseplant', 'Simmer pits and skins for a natural pink fabric dye'] },
  'Banana': { part: 'peels', pct: 36, ideas: ['Blend one washed peel into banana bread or a smoothie', 'Shred peels and sauté with spices as a "pulled" taco filling'] },
  'Blueberry': { part: 'soft berries and stems', pct: 5, ideas: ['Cook soft (not moldy) berries into a quick compote for oatmeal or yogurt', 'Freeze soft berries for smoothies'] },
  'Cantaloupe': { part: 'rind and seeds', pct: 49, ideas: ['Blend the seed cavity with water, strain and chill for agua fresca', 'Pickle the pale inner rind like watermelon rind'] },
  'Cherry': { part: 'pits and stems', pct: 8, ideas: ['Dry the stems and steep as a mild tea', 'Wash and dry pits to fill a microwavable heat pack. Never crack or eat the kernels'] },
  'Grape': { part: 'stems and soft grapes', pct: 4, ideas: ['Freeze soft grapes as a snack or smoothie ice', 'Roast soft grapes with a little oil and salt for toast or salads'] },
  'Kiwi': { part: 'skins', pct: 24, ideas: ['The skin is edible: blend whole kiwi into smoothies', 'Slice thin, skin on, for a fiber boost'] },
  'Lemon': { part: 'peels', pct: 47, ideas: ['Zest before juicing and freeze the zest', 'Soak spent peels in vinegar for 2 weeks for a citrus cleaner', 'Candy the peels in simple syrup'] },
  'Lime': { part: 'peels', pct: 16, ideas: ['Zest before juicing and freeze it', 'Mix zest with salt for lime salt'] },
  'Mango': { part: 'pit and skin', pct: 29, ideas: ['Scrape the fruit left on the pit into a smoothie', 'Mango skin can irritate people sensitive to poison ivy, so compost it'] },
  'Orange': { part: 'peels', pct: 27, ideas: ['Dry the zest for baking or tea', 'Soak peels in vinegar for 2 weeks for a citrus cleaner', 'Candy the peels'] },
  'Peach': { part: 'pits and peels', pct: 4, ideas: ['Simmer peels with sugar and water for peach syrup', 'Compost the pits. Never crack or eat the kernels'] },
  'Pear': { part: 'cores and peels', pct: 10, ideas: ['Simmer cores and peels for pear syrup', 'Add cores to apple-scrap vinegar'] },
  'Pineapple': { part: 'core, rind and crown', pct: 49, ideas: ['Ferment the rind into tepache (rind, brown sugar, water, 2–3 days)', 'Slice the core thin for smoothies or the grill', 'Root the crown in water, then plant it'] },
  'Plum': { part: 'pits and skins', pct: 6, ideas: ['Simmer leftover skins with sugar for a quick plum syrup', 'Compost the pits. Never crack or eat the kernels'] },
  'Strawberry': { part: 'tops', pct: 6, ideas: ['Tops are edible: blend them into smoothies', 'Steep tops in water or vinegar overnight for strawberry water or vinegar'] },
  'Tomato': { part: 'cores and skins', pct: 9, ideas: ['Save cores and skins in a freezer stock bag', 'Dry skins in a low oven and grind into tomato powder'] },
  'Watermelon': { part: 'rind', pct: 48, ideas: ['Pickle the white rind', 'Stir-fry or curry the peeled rind like squash', 'Blend the white rind into agua fresca'] },
  'Nectarine': { part: 'pits', pct: 9, ideas: ['Simmer skins with sugar for a quick syrup', 'Compost the pits. Never crack or eat the kernels'] },
  'Papaya': { part: 'seeds and skin', pct: 38, ideas: ['Dry the seeds and grind a little as a peppery seasoning', 'Compost the skin'] },
  'Pomegranate': { part: 'peel and membrane', pct: 44, ideas: ['Dry the peel and steep a small piece as a tart tea', 'Compost the membranes'] },
  'Asparagus': { part: 'woody ends', pct: 47, ideas: ['Simmer ends into stock, then blend and strain for asparagus soup', 'Peel the lower stalk and roast it with the tips'] },
  'Bell Pepper': { part: 'tops and cores', pct: 18, ideas: ['Cut the flesh off around the stem and dice it into salsa or eggs', 'Add tops (minus most seeds) to a freezer stock bag'] },
  'Broccoli': { part: 'stalks and leaves', pct: 39, ideas: ['Peel stalks and slice into coins for stir-fry, or shred for slaw', 'Cook the leaves like kale'] },
  'Brussels Sprouts': { part: 'outer leaves', pct: 10, ideas: ['Roast loose leaves with oil and salt as crispy chips', 'Toss them into a stir-fry'] },
  'Cabbage': { part: 'outer leaves and core', pct: 20, ideas: ['Use big outer leaves as wraps or for cabbage rolls', 'Slice the core thin into slaw or stir-fry'] },
  'Carrot': { part: 'tops and peels', pct: 11, ideas: ['Blend the tops into pesto or chimichurri', 'Add peels to a freezer stock bag'] },
  'Cauliflower': { part: 'leaves and core', pct: 61, ideas: ['Roast the leaves with oil and salt, they crisp like chips', 'Dice the core into soup or rice it with the florets'] },
  'Celery': { part: 'leaves and base', pct: 11, ideas: ['Use the leaves like parsley in salads and soups', 'Set the base in a dish of water to regrow'] },
  'Corn': { part: 'cobs and husks', pct: 64, ideas: ['Simmer cobs 45 minutes for a sweet corn stock (great for chowder)', 'Use husks to wrap fish or tamales on the grill'] },
  'Cucumber': { part: 'ends and peels', pct: 3, ideas: ['Drop ends into a water pitcher', 'Blend peels into a green smoothie'] },
  'Eggplant': { part: 'ends and peels', pct: 19, ideas: ['Bake peels with oil and salt into crispy chips', 'Compost the stem ends'] },
  'Garlic': { part: 'skins and root ends', pct: 13, ideas: ['Add skins to a stock bag for flavor (strain them out)', 'Compost the rest'] },
  'Green Beans': { part: 'ends', pct: 12, ideas: ['Add ends to a freezer stock bag', 'Compost the rest'] },
  'Kale': { part: 'stems and ribs', pct: 28, ideas: ['Chop stems fine and sauté them a few minutes before the leaves', 'Blend stems into pesto or a smoothie'] },
  'Lettuce': { part: 'core and outer leaves', pct: 6, ideas: ['Set a romaine base in water to regrow a few leaves', 'Wilt outer leaves into soup or stir-fry'] },
  'Mushroom': { part: 'stems and trimmings', pct: 3, ideas: ['Chop stems fine into duxelles for toast, eggs or pasta', 'Add to a stock bag for a deep broth'] },
  'Onion': { part: 'skins and ends', pct: 10, ideas: ['Add skins to stock for color and flavor', 'Simmer skins for a natural golden dye'] },
  'Peas': { part: 'ends, strings and pods', pct: 6, ideas: ['If you shelled peas, simmer the pods for a sweet stock or purée', 'Compost the strings'] },
  'Potato': { part: 'peels', pct: 25, ideas: ['Toss peels with oil and salt and bake at 400°F until crisp', 'Skip any green spots'] },
  'Spinach': { part: 'stems', pct: 28, ideas: ['Sauté stems with garlic', 'Blend stems into pesto or a smoothie'] },
  'Sweet Potato': { part: 'peels', pct: 28, ideas: ['Leave the skin on when roasting', 'Bake peels with oil and salt into crisps'] },
  'Zucchini': { part: 'ends', pct: 5, ideas: ['Add ends to a stock bag', 'Compost the rest'] },
  'Herbs (Fresh)': { part: 'stems', pct: 15, ideas: ['Blend soft stems (cilantro, parsley) into pesto or green sauce', 'Add tougher stems to stock, or freeze them in oil'] },
  'Radish': { part: 'greens', pct: 10, ideas: ['Blend the greens into pesto', 'Sauté greens with garlic like spinach'] },
  'Squash (Winter)': { part: 'seeds and rind', pct: 29, ideas: ['Rinse, dry and roast the seeds with oil and salt', 'Simmer strings and peels into stock'] },
  'Grapefruit': { part: 'peels', pct: 49, ideas: ['Candy the peels in simple syrup', 'Soak peels in vinegar for 2 weeks for a citrus cleaner'] },
  'Apricot': { part: 'pits', pct: 7, ideas: ['Compost the pits. Never crack or eat the kernels', 'Cook soft apricots into jam'] },
  'Honeydew': { part: 'rind and seeds', pct: 54, ideas: ['Pickle the pale inner rind', 'Blend the seed cavity with water and strain for agua fresca'] },
  'Raspberry': { part: 'soft berries', pct: 4, ideas: ['Cook soft (not moldy) berries into a quick sauce', 'Freeze for smoothies'] },
  'Blackberry': { part: 'soft berries', pct: 4, ideas: ['Cook soft (not moldy) berries into a quick sauce', 'Freeze for smoothies'] },
  'Jalapeño': { part: 'stems, seeds and ribs', pct: 8, ideas: ['Steep seeds and ribs in vinegar for a quick hot sauce', 'Compost the stems'] },
  'Cranberry': { part: 'stems and soft berries', pct: 2, ideas: ['Cook soft berries into sauce', 'Compost the stems'] },
  'Fig': { part: 'stems', pct: 1, ideas: ['Roast soft figs with honey for toast or yogurt', 'Compost the stems'] },
  'Green Onion': { part: 'root ends', pct: 4, ideas: ['Stand the roots in a glass of water and regrow 2–3 harvests', 'Compost when they tire out'] },
};

export const STOCK_BAG_TIP = 'Keep a freezer "stock bag" for onion skins, carrot peels, celery ends, herb stems, mushroom stems and corn cobs. Skip broccoli and cabbage, they turn bitter. When it is full, cover with water and simmer an hour.';

export const TRIM_FATES = ['trash', 'compost', 'used'];

export function scrapFor(name) {
  return SCRAPS[name] || null;
}
