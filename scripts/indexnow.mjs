// Tells Bing (and through IndexNow, Yandex, Seznam, Naver and others) which
// guide pages changed, so they're recrawled in minutes instead of weeks.
// Bing's index also feeds ChatGPT search and Copilot.
//
//   node scripts/indexnow.mjs --changed <base> <head>   pages whose HTML changed between two commits
//   node scripts/indexnow.mjs --all                     every URL in sitemap.xml
//   node scripts/indexnow.mjs /produce/how-to /produce/apples
//
// Runs automatically after each production deploy (.github/workflows/indexnow.yml).
// The key is public by design: it's served at /<key>.txt to prove we own the site.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const KEY = 'c44797235ef7b1af1d2e0b6bde5f9460';
const ORIGIN = 'https://guide.simplykrisp.com';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Maps a changed repo file to the page URL path it serves, or null. */
export function fileToPath(file) {
  if (file === 'index.html') return '/';
  if (file === 'seasonal/index.html') return '/seasonal';
  if (file === 'lab/crisper-map.html') return '/lab/crisper-map';
  const m = file.match(/^((?:produce|lab)(?:\/[^/]+)*)\/index\.html$/);
  return m ? '/' + m[1] : null;
}

function sitemapPaths() {
  const xml = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(ORIGIN, '') || '/');
}

function changedPaths(base, head) {
  const files = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', base, head], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const listed = new Set(sitemapPaths());
  return [...new Set(files.map(fileToPath).filter((p) => p && listed.has(p)))];
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args[0] === '--all' ? sitemapPaths() : args[0] === '--changed' ? changedPaths(args[1], args[2]) : args;
  if (!paths.length) return console.log('No page changes to submit.');
  const live = await fetch(`${ORIGIN}/${KEY}.txt`).then((r) => (r.ok ? r.text() : ''));
  if (live.trim() !== KEY) throw new Error(`Key file ${ORIGIN}/${KEY}.txt isn't live yet; not submitting.`);
  const urlList = paths.map((p) => ORIGIN + p).slice(0, 10000);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(ORIGIN).host, key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList }),
  });
  console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URL(s)`);
  urlList.forEach((u) => console.log('  ' + u));
  if (res.status >= 400) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
