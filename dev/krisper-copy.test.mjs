// My Krisper item-card copy: the "Keep away from" line names which item gives
// off ethylene (no ambiguous "it"), and the waste line is one inline sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'crisper/index.html'), 'utf8');
const catalog = JSON.parse(readFileSync(path.join(root, 'crisper/catalog.json'), 'utf8'));

// Pull keepAway() out of the page script and run it as-is.
const start = html.indexOf('  function keepAway(i, avoid) {');
const end = html.indexOf('\n  }\n', start) + 4;
assert.ok(start > 0 && end > start, 'keepAway() is in crisper/index.html');
const keepAway = new Function(`${html.slice(start, end)}; return keepAway;`)();
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const line = (name) => { const i = catalog.find((x) => x.name === name); return text(keepAway(i, i.avoidWith || [])); };

test('no item says "(it gives off ethylene)"', () => {
  assert.doesNotMatch(html, /\(it gives off ethylene\)/);
  for (const i of catalog) assert.doesNotMatch(keepAway(i, i.avoidWith || []), /\bit gives off|\(it /i, i.name);
});

test('producers say they give off ethylene and to keep them away from sensitive produce', () => {
  assert.equal(line('Pear'), 'Keep away from greens and broccoli — pears give off ethylene.Pears ripen faster near apples and bananas.');
  assert.equal(line('Avocado'), 'Keep away from greens and broccoli — avocados give off ethylene.Avocados ripen faster near bananas, apples and peaches.');
  assert.equal(line('Apple'), 'Keep away from lettuce, broccoli and carrots — apples give off ethylene.');
  assert.equal(line('Cantaloupe'), 'Keep away from leafy greens, broccoli and cucumbers — cantaloupes give off ethylene.');
  for (const i of catalog.filter((x) => x.ethyleneProducer)) {
    const t = text(keepAway(i, i.avoidWith || []));
    assert.match(t, /^Keep away from [^—]+ — \w+ give off ethylene\./, i.name);
    // The keep-away list is sensitive produce, never another producer.
    assert.doesNotMatch(t.split('—')[0], /apple|banana|pear|avocado|peach|tomato/i, i.name);
  }
});

test('other items keep their plain list', () => {
  assert.equal(line('Broccoli'), 'Keep away from Apples, Bananas, Peaches');
  assert.equal(line('Kiwi'), 'Keep away from Apples, Bananas, Pears');
  assert.equal(line('Onion'), 'Keep away from Potatoes');
});

test('the waste line renders inline, not one piece per line', () => {
  const rule = html.match(/\.wst\{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /flex|grid/, rule);
});
