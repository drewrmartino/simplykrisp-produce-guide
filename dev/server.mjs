// Local dev server for the Crisper Tracker — no Vercel, no Neon needed.
//   node dev/server.mjs            -> http://localhost:3000/crisper
// Uses an in-memory PGlite Postgres (or CRISPER_PGLITE_DIR to persist) and a
// Vercel-style req/res shim so the real api/crisper/*.js handlers run as-is.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { setQueryFn } from '../api/_crisper/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite(process.env.CRISPER_PGLITE_DIR || undefined);
setQueryFn(async (text, params) => (await db.query(text, params)).rows);
process.env.CRISPER_INBOUND_ADDRESS ||= 'devhash@inbound.postmarkapp.com';
process.env.CRISPER_PUBLIC_ORIGIN ||= `http://localhost:${process.env.PORT || 3000}`;
process.env.CRISPER_ADMIN_KEY ||= 'dev-admin';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return res;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    shim(res);
    const url = new URL(req.url, 'http://x');
    // CORS so a hosted copy of the page (demo build) can call this server.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Crisper-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    try {
      // Demo-only: pretend a store email was forwarded to a tester's address.
      if (url.pathname === '/dev/simulate' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { address, fixture } = JSON.parse(body || '{}');
        const F = await import('./fixtures.mjs');
        const e = F[fixture];
        const slug = (String(address || '').match(/\+([a-z0-9]{10})@/i) || [])[1];
        if (!e || !slug) { res.statusCode = 400; return res.json({ error: 'bad fixture or address' }); }
        const inbound = (await import('../api/crisper/inbound.js')).default;
        req.query = {};
        req.body = {
          From: e.from, FromFull: { Email: (e.from.match(/<(.+)>/) || [])[1] || e.from, Name: e.from.split('<')[0].trim() },
          To: 'tester@gmail.com', OriginalRecipient: address, MailboxHash: slug,
          Subject: e.subject, TextBody: e.text || '', HtmlBody: e.html || '', Headers: [],
        };
        return await inbound(req, res);
      }
      if (url.pathname.startsWith('/api/')) {
        const file = path.join(root, url.pathname.replace(/\/$/, '') + '.js');
        const mod = await import(pathToFileURL(file).href);
        let body = '';
        for await (const chunk of req) body += chunk;
        req.query = Object.fromEntries(url.searchParams);
        req.body = body ? (() => { try { return JSON.parse(body); } catch { return body; } })() : {};
        return await mod.default(req, res);
      }
      let p = url.pathname;
      if (p === '/crisper' || p === '/crisper/' || p === '/krisper' || p === '/krisper/') p = '/crisper/index.html';
      if (p === '/crisper/admin' || p === '/krisper/admin') p = '/crisper/admin.html';
      if (p === '/') p = '/index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root)) throw new Error('bad path');
      const s = await stat(file).catch(() => null);
      if (!s || s.isDirectory()) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end(String(e));
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`crisper dev server on http://localhost:${port}/crisper`));
}
