// Builds a hosted demo copy of /crisper that talks to the local dev server.
//   node dev/build-demo.mjs <outDir> [apiBase]
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
const api = process.argv[3] || '__PORT_3000__';
await mkdir(out, { recursive: true });
let html = await readFile(path.join(root, 'crisper/index.html'), 'utf8');

const panel = `
<style>
.demo{position:fixed;left:12px;bottom:12px;z-index:70;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-md);padding:10px 12px;width:250px;font-size:13px}
.demo b{display:block;margin-bottom:6px}
.demo button.d{display:block;width:100%;text-align:left;margin-top:5px;padding:6px 9px;border:1px solid var(--input);border-radius:8px;background:var(--bg);cursor:pointer;font-size:13px}
.demo .m{color:var(--muted-fg);font-size:12px;margin-top:6px}
.demo.min{width:auto}.demo.min .body{display:none}
.demo .tg{position:absolute;right:8px;top:6px;background:none;border:0;cursor:pointer;color:var(--muted-fg)}
@media (max-width:760px){.demo{left:8px;right:8px;width:auto;bottom:8px}body{padding-bottom:64px}}
</style>
<div class="demo min" id="demo"><button class="tg" type="button" id="demoTg" aria-label="Toggle demo tools">▴</button><b>Demo tools</b><div class="body">
<div class="m">Pretend an email arrived at your forwarding address. This test server resets, so data is temporary.</div>
<button class="d" data-fx="gmailVerification">Gmail sends its confirmation code</button>
<button class="d" data-fx="instacartConfirmation">Instacart order confirmation</button>
<button class="d" data-fx="instacartReceipt">Instacart final receipt</button>
<button class="d" data-fx="walmartDelivered">Walmart delivered email</button>
<button class="d" data-fx="krogerPickup">Smith's pickup receipt</button>
<button class="d" data-fx="amazonFresh">Amazon Fresh order</button>
<div class="m" id="demoMsg"></div></div></div>
<script>
(function(){
  var d=document.getElementById('demo');
  document.getElementById('demoTg').onclick=function(){d.classList.toggle('min');this.textContent=d.classList.contains('min')?'▴':'▾';};
  d.addEventListener('click',function(e){
    var b=e.target.closest('[data-fx]'); if(!b) return;
    var addr=(document.getElementById('inboxAddr').textContent||document.getElementById('setAddr').textContent||'').trim();
    var msg=document.getElementById('demoMsg');
    if(addr.indexOf('@')<0){msg.textContent='Sign up first to get a forwarding address.';return;}
    msg.textContent='Sending…';
    fetch(window.CRISPER_API+'/dev/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:addr,fixture:b.getAttribute('data-fx')})})
      .then(function(r){return r.json();}).then(function(j){
        msg.textContent=j.type==='order'?(j.duplicate?'Duplicate, skipped.':'Added '+j.added+' item'+(j.added===1?'':'s')+'. Refreshing…'):j.type==='gmail_verification'?'Code received. It appears on the setup screen.':JSON.stringify(j);
        setTimeout(function(){d.classList.add('min');document.getElementById('demoTg').textContent='▴';},700);
        if(!document.getElementById('vSetup').classList.contains('hide')) return; // setup screen polls on its own
        setTimeout(function(){location.reload();},900);
      }).catch(function(){msg.textContent='Demo server unreachable.';});
  });
})();
</script>`;

html = html.replace('<script>if(window.self', `<script>window.CRISPER_API=${JSON.stringify(api)};</script>\n<script>if(window.self`);
html = html.replace('</body>', panel + '\n</body>');
await writeFile(path.join(out, 'index.html'), html);
await mkdir(path.join(out, 'crisper'), { recursive: true });
await copyFile(path.join(root, 'crisper/catalog.json'), path.join(out, 'crisper/catalog.json'));
await copyFile(path.join(root, 'favicon.png'), path.join(out, 'favicon.png')).catch(() => {});
console.log('demo built in', out);
