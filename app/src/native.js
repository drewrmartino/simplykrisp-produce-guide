/* My Krisper iPhone app: the native parts.
 * Loaded only in the app build (app/scripts/build-www.mjs adds it after the
 * page's own script). Does nothing in a normal browser.
 *
 *  - Sign-in links: universal links (https://guide.simplykrisp.com/krisper?k=…)
 *    and simplykrisp://krisper?k=… open the app and sign it in.
 *  - "Sign in with Simply Krisp" runs in a Safari sheet and comes back here.
 *  - Store, recipe and help links open in a Safari sheet over the app.
 *  - Push notifications for the same reminders the emails send.
 */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var P = C.Plugins || {};
  var API = window.CRISPER_API || 'https://guide.simplykrisp.com';
  var PUSH_ENV = window.KRISPER_PUSH_ENV || 'production';
  var KEY_LS = 'crisperKey', TOKEN_LS = 'krisperPushToken', ASKED_LS = 'krisperPushAsked';

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function key() { return ls(KEY_LS); }
  function post(body, k) {
    return fetch(API + '/api/crisper/me', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Crisper-Key': k || key() || '' }, body: JSON.stringify(body) });
  }

  // ---------- links ----------
  function openWeb(url) {
    if (P.Browser) return P.Browser.open({ url: url, presentationStyle: 'popover', toolbarColor: '#fcfbf5' }).catch(function () { location.href = url; });
    window.open(url, '_blank');
  }
  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented) return;
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(mailto|tel|sms|javascript):/i.test(href)) return;
    if (a.id === 'shopBtn' || href.indexOf('/api/crisper/shopify') === 0) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      return openWeb(API + '/api/crisper/shopify?app=1');
    }
    var u;
    try { u = new URL(href, location.href); } catch (e) { return; }
    if (u.origin === location.origin) {
      // The app itself (logo) stays in the app; anything else is a website page.
      if (u.pathname === '/' || u.pathname === '/index.html') return;
      ev.preventDefault();
      return openWeb(API + u.pathname + u.search + u.hash);
    }
    if (/^https?:$/.test(u.protocol)) { ev.preventDefault(); openWeb(u.href); }
  }, true);

  // ---------- sign-in links (universal links + simplykrisp://) ----------
  // Hand the query (?k=, ?signin=) and hash (#check) to the page, which already
  // knows what to do with them, by reloading the app with them.
  function handleUrl(raw) {
    if (!raw) return false;
    var u;
    try { u = new URL(raw); } catch (e) { return false; }
    var path = (u.protocol === 'simplykrisp:' ? '/' + u.hostname + u.pathname : u.pathname).replace(/\/+$/, '');
    if (!/^\/(krisper|crisper)$/.test(path) && !u.searchParams.get('k')) return false;
    var q = new URLSearchParams();
    ['k', 'signin'].forEach(function (n) { var v = u.searchParams.get(n); if (v) q.set(n, v); });
    if (P.Browser) P.Browser.close().catch(function () {});
    var next = '/index.html' + (q.toString() ? '?' + q.toString() : '') + (u.hash || '');
    try { sessionStorage.setItem('krisperLastUrl', raw); } catch (e) {}
    location.replace(next);
    return true;
  }
  if (P.App) {
    P.App.addListener('appUrlOpen', function (e) { handleUrl(e && e.url); });
    // Cold start from a link: the URL arrives here instead of appUrlOpen.
    P.App.getLaunchUrl().then(function (r) {
      var url = r && r.url;
      var seen; try { seen = sessionStorage.getItem('krisperLastUrl'); } catch (e) {}
      if (url && url !== seen) handleUrl(url);
    }).catch(function () {});
    // Coming back after a long time away: reload so "use today" dates are fresh.
    var hiddenAt = 0;
    P.App.addListener('appStateChange', function (s) {
      if (!s.isActive) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 3 * 3600e3 && !document.querySelector('.scrim:not(.hide)')) location.reload();
    });
  }

  // ---------- push notifications ----------
  var PN = P.PushNotifications, pushReady = false;
  function setupPush() {
    if (!PN || pushReady || !key()) return;
    pushReady = true;
    PN.addListener('registration', function (t) {
      ls(TOKEN_LS, t.value);
      post({ pushToken: t.value, pushEnv: PUSH_ENV }).catch(function () {});
    });
    PN.addListener('registrationError', function (e) { console.warn('push registration', e && e.error); });
    PN.addListener('pushNotificationActionPerformed', function (a) {
      var path = (a && a.notification && a.notification.data && a.notification.data.path) || '';
      location.replace('/index.html' + (path.charAt(0) === '#' ? path : ''));
    });
    PN.checkPermissions().then(function (p) {
      if (p.receive === 'granted') return PN.register();
      if (p.receive !== 'prompt' && p.receive !== 'prompt-with-rationale') return;
      if (ls(ASKED_LS)) return;
      // Ask once, after the fridge is on screen, so the question has context.
      whenDashboard(function () {
        ls(ASKED_LS, '1');
        PN.requestPermissions().then(function (r) { if (r.receive === 'granted') PN.register(); });
      });
    }).catch(function () {});
  }
  function whenDashboard(fn) {
    var tries = 0;
    var t = setInterval(function () {
      var d = document.getElementById('vDash');
      if (d && !d.classList.contains('hide')) { clearInterval(t); setTimeout(fn, 1200); }
      else if (++tries > 120) clearInterval(t);
    }, 500);
  }
  // Sign-up and email sign-in can happen without a reload; start push once a key shows up.
  if (key()) setupPush();
  else { var w = setInterval(function () { if (key()) { clearInterval(w); setupPush(); } }, 3000); }

  // Signing out stops this phone's notifications for that account.
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest || !ev.target.closest('#signOut')) return;
    var t = ls(TOKEN_LS), k = key();
    if (t && k) post({ pushToken: t, pushOff: true }, k).catch(function () {});
  }, true);

  // ---------- look ----------
  // White status-bar text over the dark green Simply Krisp header.
  if (P.StatusBar) P.StatusBar.setStyle({ style: 'DARK' }).catch(function () {});
  if (P.SplashScreen) window.addEventListener('load', function () { P.SplashScreen.hide().catch(function () {}); });
})();
