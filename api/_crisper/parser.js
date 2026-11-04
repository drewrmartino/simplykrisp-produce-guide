// Turns a grocery email (or pasted receipt text) into produce items.
//
// Deliberately rule-based: no AI call, no per-email cost, and every decision can
// be explained to a tester ("we skipped 'apple juice' because it's a drink").
// The approach:
//   1. Work out who sent it (retailer) and what kind of email it is
//      (order confirmation vs final receipt / delivered).
//   2. Split the body into lines and, for each line, find the LONGEST produce
//      alias it contains, so "green onion" beats "onion".
//   3. Drop lines that are clearly not fresh produce (juice, chips, frozen…) or
//      were refunded / out of stock, and follow "replaced with" substitutions.
//   4. Merge duplicates and pull out a quantity where one is written.

import { CATALOG } from './catalog.js';

// ---------- text helpers ----------

export function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // jalapeño -> jalapeno
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&amp;/g, '&');
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '  ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([nNaAeEiIoOuU])(tilde|acute|grave|uml|circ);/g, (_, l) => l)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pluralForms(alias) {
  const a = normalize(alias);
  const out = new Set([a]);
  const words = a.split(' ');
  const last = words[words.length - 1];
  const stem = words.slice(0, -1).join(' ');
  const join = (w) => (stem ? `${stem} ${w}` : w);
  if (/[^aeiou]y$/.test(last)) out.add(join(last.slice(0, -1) + 'ies'));
  else if (/(o|ch|sh|s|x)$/.test(last)) out.add(join(last + 'es'));
  if (!/s$/.test(last)) out.add(join(last + 's'));
  // "tomatoes on the vine" style aliases already plural
  return [...out];
}

// Build one matcher per alias form, sorted longest first.
const MATCHERS = [];
for (const item of CATALOG) {
  for (const alias of item.aliases) {
    for (const form of pluralForms(alias)) {
      MATCHERS.push({
        name: item.name,
        form,
        re: new RegExp(`(^|[^a-z])${escapeRe(form)}(?![a-z])`),
      });
    }
  }
}
MATCHERS.sort((a, b) => b.form.length - a.form.length);

// A line containing any of these is not fresh produce, even if it names one.
const NOT_FRESH = [
  'juice', 'cider', 'sauce', 'applesauce', 'paste', 'ketchup', 'salsa', 'puree', 'concentrate',
  'chips', 'crisps', 'cracker', 'pretzel', 'popcorn', 'cereal', 'granola', 'oatmeal', 'bar', 'bars',
  'cookie', 'cake', 'pie', 'muffin', 'bread', 'bagel', 'tortilla', 'pizza', 'crust', 'pasta', 'noodle',
  'yogurt', 'kefir', 'ice cream', 'sorbet', 'popsicle', 'smoothie', 'milk', 'creamer', 'cheese', 'butter',
  'jam', 'jelly', 'preserves', 'spread', 'syrup', 'honey', 'candy', 'gummies', 'gummy', 'chocolate',
  'soda', 'seltzer', 'sparkling', 'drink', 'beverage', 'tea', 'coffee', 'kombucha', 'water', 'lemonade', 'limeade',
  'wine', 'beer', 'vodka', 'hard cider', 'margarita',
  'frozen', 'dried', 'dehydrated', 'freeze-dried', 'freeze dried', 'canned', 'can ', ' cans', 'jar', 'jarred',
  'pickled', 'pickle', 'diced tomatoes', 'crushed', 'sun-dried', 'sun dried', 'stewed',
  'powder', 'salt', 'seasoning', 'spice', 'extract', 'flavor', 'flavored', 'oil', 'vinegar', 'dressing',
  'soup', 'broth', 'stock', 'hummus', 'guacamole', 'dip', 'pesto', 'chutney', 'relish',
  'baby food', 'pouch', 'vitamin', 'supplement',
  'scented', 'candle', 'soap', 'shampoo', 'conditioner', 'lotion', 'lip balm', 'detergent', 'cleaner', 'air freshener',
  'seed', 'seeds', 'plant', 'starter', 'cornmeal', 'cornstarch', 'corn starch', 'masa', 'grits',
  'split pea', 'chickpea', 'black-eyed', 'cauliflower rice bowl', 'tots', 'fries', 'hash brown',
];
const NOT_FRESH_RE = new RegExp(`(^|[^a-z])(${NOT_FRESH.map(escapeRe).join('|')})(?![a-z])`);

// Line-level signals that an item did NOT arrive.
const DID_NOT_ARRIVE_RE = /(refunded|refund issued|out of stock|unavailable|not available|couldn'?t find|could not find|was removed|removed from (your )?order|cancel+ed)/;
// "Replaced with" / "Substituted with": the part after "with" is what arrived.
const REPLACED_RE = /(replac|substitut|swapp)\w*\b.*?\bwith\b(.*)$/;

// Retailer detection (sender address first, then body text).
const RETAILERS = [
  ['Instacart', /instacart/],
  ["Sam's Club", /samsclub|sam'?s club/],
  ['Walmart', /walmart/],
  ["Smith's", /smithsfoodanddrug|smith'?s food/],
  ['Kroger', /kroger|fredmeyer|fred meyer|king soopers|kingsoopers|ralphs|fry'?s food|frysfood|qfc\.com|harristeeter|harris teeter/],
  ['Amazon', /amazon|whole ?foods/],
  ['Target', /target\.com|target circle/],
  ['Costco', /costco/],
  ["Harmons", /harmons/],
  ['Sprouts', /sprouts/],
  ['Thrive Market', /thrivemarket|thrive market/],
  ['Misfits Market', /misfitsmarket|misfits market/],
  ['Imperfect Foods', /imperfectfoods|imperfect foods/],
  ['Hungryroot', /hungryroot/],
  ['Albertsons', /albertsons|safeway|\bvons\b|vons\.com|jewel-?osco|acme ?markets|shaws\.com|randalls|tomthumb|tom thumb|pavilions\.com|starmarket/],
  ['Publix', /publix/],
  ['H-E-B', /heb\.com|\bh-e-b\b/],
  ['Meijer', /meijer/],
  ['Hy-Vee', /hy-?vee/],
  ['Wegmans', /wegmans/],
  ['Stop & Shop', /stopandshop|stop & shop/],
  ['Giant', /giantfood|giant food/],
  ['Food Lion', /foodlion|food lion/],
  ['Hannaford', /hannaford/],
  ['Aldi', /aldi\.us|\baldi\b/],
  ['FreshDirect', /freshdirect/],
  ['Gopuff', /gopuff/],
  ['Shipt', /shipt/],
  ['DoorDash', /doordash/],
  ['Uber Eats', /uber ?eats/],
];

export function detectRetailer(from, subject, body) {
  const hay = normalize(`${from}\n${subject}\n${String(body || '').slice(0, 3000)}`);
  for (const [name, re] of RETAILERS) if (re.test(hay)) return name;
  return 'Other';
}

// confirmation = items are on the way (pending); receipt = final, what arrived.
export function detectKind(subject, body) {
  const s = normalize(subject);
  const b = normalize(String(body || '').slice(0, 2500));
  if (/(receipt|delivered|has arrived|was delivered|been delivered|picked up|pickup complete|order complete|is complete|final total|your order is here|dropped off)/.test(s)) return 'receipt';
  if (/(confirm|placed|we got your order|we received your order|thanks for your order|thank you for your order|order received|order is in|scheduled|on its way|on the way|out for delivery|shopping for you|is being prepared)/.test(s)) return 'confirmation';
  if (/(receipt|delivered|final charge|final total)/.test(b)) return 'receipt';
  if (/(order confirm|thanks for your order|thank you for your order|estimated total)/.test(b)) return 'confirmation';
  return 'receipt';
}

// Store newsletters and sale flyers mention produce too ("Avocados 2 for $5").
// An email only counts as an order if it carries order evidence: an order
// number, an order-style subject, or receipt-style lines in the body.
export function looksLikeOrder(subject, body, orderRef) {
  if (orderRef) return true;
  const s = normalize(subject);
  if (/(your order|order #|order no|receipt|delivered|delivery|pickup|picked up|has arrived|on its way|out for delivery|shopping for you|thanks for your order|thank you for your order|order (is )?(confirmed|complete|received|placed))/.test(s)) return true;
  const b = normalize(String(body || '').slice(0, 8000));
  return /(subtotal|order total|order summary|items in your order|your order|order number|order #|qty|quantity|final total|total charged|amount charged|receipt)/.test(b);
}

export function detectOrderRef(subject, body) {
  const hay = `${subject}\n${String(body || '').slice(0, 6000)}`;
  for (const m of hay.matchAll(/order\s*(?:number|no\.?|#|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,})/gi)) {
    const ref = m[1].replace(/-+$/, '');
    if (/\d/.test(ref)) return ref.toUpperCase();
  }
  return null;
}

// Gmail sends this to the forwarding address before it will forward anything.
export function detectGmailVerification(from, subject, body) {
  const f = normalize(from);
  const s = normalize(subject);
  if (!(/forwarding-noreply@google\.com/.test(f) || /gmail forwarding confirmation/.test(s))) return null;
  const text = String(body || '');
  const code = (text.match(/confirmation code:?\s*(\d{6,12})/i) || subject.match(/\(#(\d{6,12})\)/) || [])[1] || null;
  const link = (text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s"'<>]+/i) || [])[0] || null;
  const fromAddr = (subject.match(/from\s+([^\s]+@[^\s]+)/i) || text.match(/([A-Z0-9._%+-]+@gmail\.com)\s+has requested/i) || [])[1] || null;
  return { code, link, fromAddress: fromAddr };
}

// Outlook / Microsoft 365 forward-rule confirmations don't need a code, but some
// mail providers send a "confirm forwarding" style message. Treat anything that
// looks like it as a setup message so it doesn't show up as an empty receipt.
export function looksLikeSetupMessage(from, subject) {
  return /(forwarding (address )?(confirmation|verification)|verify (your )?forwarding|confirm (your )?forwarding)/.test(normalize(`${from} ${subject}`));
}

// ---------- line parsing ----------

const WEIGHT_RE = /(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g)\b/;
const COUNT_PATTERNS = [
  /\bqty\.?\s*:?\s*(\d{1,2})\b/,
  /\bquantity\s*:?\s*(\d{1,2})\b/,
  /^\s*(\d{1,2})\s*(?:x|×)\s+/,
  /\s(?:x|×)\s*(\d{1,2})\s*$/,
  /\b(\d{1,2})\s*(?:ct|count|each|ea|pk|pack|bunches|bunch)\b/,
  /\b(\d{1,2})\s*@/, // "CUCUMBERS 2 @ 0.99"
  /\b(\d{1,2})\s+for\s+\$?\d/, // "KIWI 6 FOR 3.00"
  /\s(\d{1,2})\s+\$\d/, // table column: "Zucchini Squash   3   $2.37"
  /[a-z,)]\s+(\d{1,2})\s*$/, // trailing bare count: "Pears, Bartlett 3"
  /^\s*(\d{1,2})\s+(?!(?:lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|ct|count)\b)(?=[a-z])/,
];

function quantityOf(line) {
  let count = null;
  for (const re of COUNT_PATTERNS) {
    const m = line.match(re);
    if (m) {
      count = Number(m[1]);
      break;
    }
  }
  const w = line.match(WEIGHT_RE);
  const weight = w ? `${w[1]} ${w[2].replace(/^pounds?$/, 'lb').replace(/^ounces?$/, 'oz').replace(/^lbs$/, 'lb')}` : null;
  if (!count || count < 1 || count > 48) count = 1;
  return { count, weight };
}

// Header-ish lines we never treat as items, even if they contain a produce word
// (e.g. "Orange Theory" promos, "Apple Pay" payment lines).
const IGNORE_LINE_RE = /(apple pay|apple card|orange county|orangetheory|subject:|from:|to:|sent:|date:|unsubscribe|privacy|terms|view in browser|download the app|app store|google play|copyright|©)/;

// Words that suggest a line is a grocery item even if we couldn't match it.
const PRODUCE_HINT_RE = /\b(organic|fresh|bunch|per lb|\/lb|each|produce|bag|clamshell|ripe|bulk)\b/;

const NEXT_QTY_RE = /^\s*(\d+(?:\.\d+)?)\s*(x|×|ct|count|lb|lbs|oz|each|ea|pk|@)(?![a-z])/;

export function extractItems(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const found = new Map(); // name -> {name, count, weight, lines[]}
  const skipped = []; // {line, reason, name?}
  const unknown = []; // grocery-looking lines we couldn't map

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.length > 240) continue; // paragraphs, not item lines
    let line = normalize(raw);
    if (IGNORE_LINE_RE.test(line)) continue;

    const rep = line.match(REPLACED_RE);
    if (rep && rep[2].trim()) line = rep[2].trim();

    const match = MATCHERS.find((m) => m.re.test(line));
    if (!match) {
      if (PRODUCE_HINT_RE.test(line) && /[a-z]{3,}/.test(line) && !NOT_FRESH_RE.test(line) && !/total|subtotal|tax|fee|tip|discount|savings|delivery|service/.test(line)) {
        unknown.push(raw);
      }
      continue;
    }
    if (DID_NOT_ARRIVE_RE.test(line) && !rep) {
      skipped.push({ line: raw, name: match.name, reason: 'not delivered' });
      continue;
    }
    // Test the rest of the line, minus the produce name itself, so "butter
    // lettuce" or "cotton candy grapes" aren't mistaken for butter or candy.
    if (NOT_FRESH_RE.test(line.replace(match.form, ' '))) {
      skipped.push({ line: raw, name: match.name, reason: 'not fresh produce' });
      continue;
    }
    let q = quantityOf(line);
    // Many receipts put quantity/price on the line below the item name:
    //   "Organic Bananas" / "6 ct  $2.09"
    const next = normalize(lines[i + 1] || '');
    if (q.count === 1 && NEXT_QTY_RE.test(next) && !MATCHERS.some((m) => m.re.test(next))) {
      const nq = quantityOf(next);
      q = { count: nq.count, weight: q.weight || nq.weight };
      i++;
    }
    const cur = found.get(match.name);
    if (cur) {
      // Same item listed twice (e.g. two apple varieties): add counts.
      cur.count += q.count;
      if (q.weight && !cur.weight) cur.weight = q.weight;
      cur.lines.push(raw);
    } else {
      found.set(match.name, { name: match.name, count: q.count, weight: q.weight, lines: [raw] });
    }
  }

  return {
    items: [...found.values()],
    skipped: skipped.slice(0, 40),
    unknown: [...new Set(unknown)].slice(0, 25),
  };
}

// For manually forwarded mail, the original sender/subject live in the body.
export function unwrapForward(subject, body) {
  const text = String(body || '');
  const m = text.match(/-{2,}\s*(?:forwarded message|original message)\s*-{2,}([\s\S]*)/i) ||
    text.match(/begin forwarded message:([\s\S]*)/i);
  if (!m) return null;
  const inner = m[1];
  const from = (inner.match(/^\s*from:\s*(.+)$/im) || [])[1] || '';
  const subj = (inner.match(/^\s*subject:\s*(.+)$/im) || [])[1] || subject;
  return { from, subject: subj.trim(), body: inner };
}

// One call for everything: returns what the API needs to store.
export function parseEmail({ from = '', subject = '', text = '', html = '', requireOrder = false }) {
  let body = text && text.trim().length > 40 ? text : htmlToText(html) || text;
  let sender = from;
  let subj = subject;

  const verification = detectGmailVerification(sender, subj, body);
  if (verification) return { type: 'gmail_verification', verification };
  if (looksLikeSetupMessage(sender, subj)) return { type: 'setup_message' };

  const fwd = unwrapForward(subj, body);
  if (fwd) {
    sender = fwd.from || sender;
    subj = fwd.subject || subj;
    body = fwd.body;
  }

  const retailer = detectRetailer(sender, subj, body);
  const kind = detectKind(subj, body);
  const orderRef = detectOrderRef(subj, body);
  if (requireOrder && !looksLikeOrder(subj, body, orderRef)) return { type: 'promo', retailer, subject: subj.slice(0, 200) };
  const { items, skipped, unknown } = extractItems(body);
  return { type: 'order', retailer, kind, orderRef, subject: subj.slice(0, 200), sender: sender.slice(0, 200), items, skipped, unknown };
}
