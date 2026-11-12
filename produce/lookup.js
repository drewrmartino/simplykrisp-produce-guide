// "What went wrong?" symptom checker. Data is inlined by scripts/build-produce-pages.mjs.
// Deep links: /produce/what-went-wrong?item=broccoli&symptom=yellow
(function () {
  var D = JSON.parse(document.getElementById('wwdata').textContent);
  var itemsEl = document.getElementById('items');
  var symsEl = document.getElementById('syms');
  var step2 = document.getElementById('step2');
  var ans = document.getElementById('answer');
  var cur = null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setUrl(item, sym) {
    try {
      var q = item ? '?item=' + item + (sym ? '&symptom=' + sym : '') : '';
      history.replaceState(null, '', location.pathname + q);
    } catch (e) {}
  }
  function press(box, val) {
    [].forEach.call(box.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === val)); });
  }

  D.items.forEach(function (it) {
    var b = document.createElement('button');
    b.type = 'button'; b.dataset.v = it.slug; b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<img src="' + esc(it.img) + '" alt="" width="24" height="24" />' + esc(it.name);
    b.onclick = function () { pickItem(it.slug, true); };
    itemsEl.appendChild(b);
  });

  function pickItem(slug, scroll) {
    cur = D.items.filter(function (i) { return i.slug === slug; })[0];
    if (!cur) return;
    press(itemsEl, slug);
    ans.innerHTML = '';
    symsEl.innerHTML = '';
    cur.f.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.v = f.id; b.setAttribute('aria-pressed', 'false');
      b.textContent = f.t;
      b.onclick = function () { pickSym(f.id, true); };
      symsEl.appendChild(b);
    });
    var other = document.createElement('a');
    other.href = '/produce/' + cur.slug; other.className = 'more';
    other.style.alignSelf = 'center';
    other.textContent = 'Something else? See the full ' + cur.name.toLowerCase() + ' page';
    symsEl.appendChild(other);
    step2.hidden = false;
    setUrl(slug);
    if (scroll) step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function li(a) { return a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }

  function pickSym(id, scroll) {
    var f = cur && cur.f.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    press(symsEl, id);
    ans.innerHTML = '<article class="fail">' +
      '<span class="lbl">' + esc(cur.name) + '</span><h2>' + esc(f.t) + '</h2>' +
      '<div class="tags"><span class="cause">' + esc(D.causes[f.c]) + '</span><span class="verdict v-' + f.v + '">' + esc(D.verdicts[f.v]) + '</span></div>' +
      '<div class="grid2"><div class="blk"><span class="lbl">Why it happens</span><p>' + esc(f.w) + '</p></div>' +
      '<div class="blk ok v-' + f.v + '"><span class="lbl">Is it still OK?</span><p>' + esc(f.n) + '</p></div></div>' +
      '<div class="grid2"><div class="blk"><span class="lbl">Prevent it next time</span><ul>' + li(f.p) + '</ul></div>' +
      (f.r.length ? '<div class="blk"><span class="lbl">Use it up</span><ul>' + li(f.r) + '</ul></div>' : '') + '</div>' +
      '<a class="go" href="/produce/' + cur.slug + '#' + f.id + '">Sources and more on ' + esc(cur.name.toLowerCase()) + '</a>' +
      '</article>';
    setUrl(cur.slug, id);
    if (scroll) ans.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var q = new URLSearchParams(location.search);
  if (q.get('item')) { pickItem(q.get('item'), false); if (q.get('symptom')) pickSym(q.get('symptom'), false); }
})();
