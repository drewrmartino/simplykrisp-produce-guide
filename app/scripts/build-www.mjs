// Builds app/www (what Capacitor bundles into the iPhone app) from the same
// crisper/index.html the website serves, so there is one app to maintain.
//
//   node scripts/build-www.mjs
//
// Env (optional):
//   CRISPER_API       API origin the app calls      (default https://guide.simplykrisp.com)
//   CRISPER_SITE      site used for shared links    (default same as CRISPER_API)
//   KRISPER_PUSH_ENV  production | development      (development = Xcode debug runs)

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const repo = path.resolve(app, '..');
const out = path.join(app, 'www');

const API = (process.env.CRISPER_API || 'https://guide.simplykrisp.com').replace(/\/$/, '');
const SITE = (process.env.CRISPER_SITE || API).replace(/\/$/, '');
const PUSH_ENV = process.env.KRISPER_PUSH_ENV === 'development' ? 'development' : 'production';

// Styles only the app uses: room for the iPhone status bar, and none of the
// website's store menu, footer or install prompts (Apple guideline 4.2 asks
// for an app, not a wrapped website).
const NATIVE_CSS = `
html.native body{padding-top:env(safe-area-inset-top)}
html.native body::before{content:"";position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);background:#2e431f;z-index:1000}
html.native .skh-bar,html.native .skh-burger,html.native .skh-nav,html.native footer,html.native #installCard,html.native #setInstall{display:none!important}
html.native .sheet{padding-bottom:calc(24px + env(safe-area-inset-bottom))}
html.native .toast{bottom:calc(22px + env(safe-area-inset-bottom))}
html.native body.has-bnav .toast{bottom:calc(84px + env(safe-area-inset-bottom))}
html.native{-webkit-tap-highlight-color:transparent}
html.native body{-webkit-user-select:none;user-select:none}
html.native input,html.native textarea,html.native code,html.native .kbd,html.native #myLink{-webkit-user-select:text;user-select:text}
`;

export function transform(html, { api = API, site = SITE, pushEnv = PUSH_ENV } = {}) {
  const must = (re, label) => { if (!re.test(html)) throw new Error(`build-www: expected ${label} in crisper/index.html`); };
  must(/<meta name="viewport"[^>]*>/, 'viewport meta');
  must(/<\/head>/, '</head>');
  must(/\n\s*boot\(\);\n\}\)\(\);\n<\/script>/, 'boot() call at the end of the main script');

  let s = html;
  s = s.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />');
  // No web manifest or service worker inside the app.
  s = s.replace(/<link rel="manifest"[^>]*>\s*/g, '');
  const globals = `<script>window.KRISPER_NATIVE=true;window.CRISPER_API=${JSON.stringify(api)};window.CRISPER_SITE=${JSON.stringify(site)};window.KRISPER_PUSH_ENV=${JSON.stringify(pushEnv)};document.documentElement.classList.add('native');</script>\n<style>${NATIVE_CSS}</style>\n`;
  s = s.replace(/<head>/, `<head>\n${globals}`);
  // Website-only pages open in an in-app browser (native.js); give them full URLs.
  s = s.replace(/href="\/(seasonal|lab)"/g, (_, p) => `href="${site}/${p}"`);
  s = s.replace(/<a class="btn ghost" href="\/">/g, `<a class="btn ghost" href="${site}/">`);
  s = s.replace(/<a class="mobile-hide" href="\/">/g, `<a class="mobile-hide" href="${site}/">`);
  s = s.replace(/<\/body>/, '<script src="native.js"></script>\n</body>');
  return s;
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'assets'), { recursive: true });
  const html = await readFile(path.join(repo, 'crisper/index.html'), 'utf8');
  await writeFile(path.join(out, 'index.html'), transform(html));
  await cp(path.join(app, 'src/native.js'), path.join(out, 'native.js'));
  await cp(path.join(repo, 'assets/sk-header.js'), path.join(out, 'assets/sk-header.js'));
  await cp(path.join(repo, 'icons'), path.join(out, 'icons'), { recursive: true });
  await cp(path.join(repo, 'favicon.png'), path.join(out, 'favicon.png'));
  // Bundled copy for first launch offline; the page still loads the live one.
  await mkdir(path.join(out, 'crisper'), { recursive: true });
  await cp(path.join(repo, 'crisper/catalog.json'), path.join(out, 'crisper/catalog.json'));
  console.log(`www built -> ${path.relative(process.cwd(), out) || out}  (API ${API}, push ${PUSH_ENV})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
