/* SimplyKrisp shared site header.
 * One source for the announcement bar + header on every guide.simplykrisp.com
 * page, styled to match the simplykrisp.com (Shopify "Flora") header so the
 * store and the tools look like one site. Keep MENU in sync with the Shopify
 * "Main menu" (Admin → Content → Menus).
 * When a page is embedded in the store (iframe), the store already shows its
 * header, so nothing is injected.
 * Elements marked data-sk-header-extra are moved into the header's right side
 * (My Krisper uses this for its Settings button).
 */
(function () {
  if (window.self !== window.top) return;
  var STORE = 'https://simplykrisp.com';
  var UTM = 'utm_source=produce-guide&utm_medium=referral&utm_campaign=site-header';
  var LOGO = 'https://simplykrisp.com/cdn/shop/files/v2_Simply_Krisp_Logo_-_Lime_and_Orange_Freshness_700_x_350_px_f00ce263-9da7-4e9d-9e09-55291aaf9e85.png?v=1774895710&width=380';
  var MENU = [
    ['Home', STORE + '/?' + UTM],
    ['About Us', STORE + '/pages/about-us?' + UTM],
    ['Produce Storage Guide', '/', 'guide'],
    ["What's In Season", '/seasonal', 'seasonal'],
    ['Lab Notebook', '/lab', 'lab'],
    ['My Krisper (Beta)', '/krisper', 'krisper'],
    ['Shop', STORE + '/collections/all?' + UTM],
    ['FAQ', STORE + '/pages/faq?' + UTM],
    ['Contact', STORE + '/pages/contact?' + UTM]
  ];
  var p = location.pathname;
  var cur = /^\/(krisper|crisper)/.test(p) ? 'krisper' : /^\/lab/.test(p) ? 'lab' : /^\/seasonal/.test(p) ? 'seasonal' : 'guide';

  var css = '' +
    'html.skh-on header:not(.skh){display:none!important}' +
    '.skh-bar{background:#55654b;color:#fcfbf5;text-align:center;font:400 13px/1 Trirong,Georgia,serif;letter-spacing:.12em;padding:11px 16px;text-transform:uppercase}' +
    '.skh-bar a{color:inherit;text-decoration:none}' +
    '.skh{background:#2e431f!important;font-family:Questrial,"DM Sans",system-ui,sans-serif;position:relative!important;top:auto!important;border-bottom:0!important;z-index:50}' +
    '.skh-in{max-width:1200px;margin:0 auto;padding:14px 32px;display:flex;align-items:center;gap:28px}' +
    '.skh-logo img{display:block;width:150px;height:auto}' +
    '.skh-nav{display:flex;flex-wrap:wrap;gap:6px 22px;flex:1}' +
    '.skh-nav a{color:#fb8c00;text-decoration:none;font-size:15px;line-height:1.6;padding:2px 0;border-bottom:1px solid transparent}' +
    '.skh-nav a:hover,.skh-nav a[aria-current=page]{border-bottom-color:#fb8c00}' +
    '.skh-right{display:flex;align-items:center;gap:14px}' +
    '.skh-right button,.skh-right a.skh-cart{background:none;border:0;color:#fb8c00;font:inherit;font-size:15px;cursor:pointer;padding:4px;display:inline-flex;align-items:center}' +
    '.skh-right .hide{display:none!important}' +
    '.skh-burger{display:none!important}' +
    '@media(max-width:989px){.skh-in{padding:12px 18px;gap:12px;flex-wrap:wrap}.skh-burger{display:inline-flex!important;order:-1}.skh-logo{flex:1;display:flex;justify-content:center}.skh-logo img{width:120px}' +
    '.skh-nav{display:none;order:5;flex-basis:100%;flex-direction:column;gap:0;padding:6px 0 4px;border-top:1px solid rgba(251,140,0,.25)}.skh.open .skh-nav{display:flex}.skh-nav a{padding:10px 2px;font-size:16px;border-bottom:0}}' +
    '@media print{.skh,.skh-bar{display:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  if (!document.querySelector('link[href*="family=Trirong"]')) {
    var lk = document.createElement('link'); lk.rel = 'stylesheet';
    lk.href = 'https://fonts.googleapis.com/css2?family=Questrial&family=Trirong&display=swap';
    document.head.appendChild(lk);
  }
  document.documentElement.className += ' skh-on';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  var nav = MENU.map(function (m) {
    return '<a href="' + esc(m[1]) + '"' + (m[2] === cur ? ' aria-current="page"' : '') + '>' + esc(m[0]) + '</a>';
  }).join('');
  var html = '<div class="skh-bar" role="region" aria-label="Announcement"><a href="' + STORE + '/products/double-krisp-subscription?' + UTM + '">Subscribe and save 25%</a></div>' +
    '<header class="skh"><div class="skh-in">' +
    '<span class="skh-right"><button class="skh-burger" type="button" aria-label="Menu" aria-expanded="false"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button></span>' +
    '<a class="skh-logo" href="' + STORE + '/?' + UTM + '"><img src="' + LOGO + '" alt="Simply Krisp" width="150" height="75"></a>' +
    '<nav class="skh-nav" aria-label="Main">' + nav + '</nav>' +
    '<span class="skh-right" id="skhExtra"><a class="skh-cart" href="' + STORE + '/cart" aria-label="Cart"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg></a></span>' +
    '</div></header>';

  function mount() {
    document.body.insertAdjacentHTML('afterbegin', html);
    var h = document.querySelector('header.skh');
    var b = h.querySelector('.skh-burger');
    b.addEventListener('click', function () { var o = h.classList.toggle('open'); b.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    function extras() {
      var extra = document.getElementById('skhExtra');
      Array.prototype.slice.call(document.querySelectorAll('header:not(.skh) [data-sk-header-extra]')).forEach(function (n) { extra.insertBefore(n, extra.firstChild); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', extras); else extras();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
