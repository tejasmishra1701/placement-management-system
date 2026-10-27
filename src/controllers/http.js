'use strict';
// HTTP adapter: parses requests (D1a REST / JSON), dispatches to controllers, maps AppError codes to
// HTTP statuses (Section 47.5 catalogue) and serves the static web client.
const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('../domain/errors');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const MAX_BODY = 1024 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new AppError('E-VAL', 'Request body too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(new AppError('E-VAL', 'Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, publicDir, pathname) {
  const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(publicDir, safe);
  if (!file.startsWith(publicDir)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(publicDir, 'index.html'); // SPA fallback
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function createHttpHandler(router, publicDir, { log = true } = {}) {
  return async function handle(req, res) {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    if (log) res.on('finish', () => console.log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started} ms)`));
    try {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const match = router.match(req.method, url.pathname);
        if (!match) return sendJson(res, 404, { error: { code: 'E-NOTFOUND', message: `No API route for ${req.method} ${url.pathname}.` } });
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
        const auth = req.headers.authorization || '';
        const token = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : null;
        const ctx = { token, params: match.params, query: Object.fromEntries(url.searchParams), body, method: req.method };
        const result = await match.handler(ctx);
        if (result && result.__raw) {
          res.writeHead(result.status || 200, result.headers || {});
          return res.end(result.body);
        }
        return sendJson(res, result && result.__status ? result.__status : 200, result === undefined ? {} : result);
      }
      if (url.pathname.startsWith('/resumes/')) { // demo placeholder for Student.resumeFileUrl
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`Resume placeholder for ${path.basename(url.pathname)}\n(In the real system this would be the uploaded PDF; access is limited to the placement office and the company applied to - NFR-012.)\n`);
      }
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(res, publicDir, url.pathname);
      return sendJson(res, 405, { error: { code: 'E-VAL', message: 'Method not allowed.' } });
    } catch (err) {
      if (err instanceof AppError) return sendJson(res, err.status, { error: err.toJSON() });
      console.error('[unhandled]', err);
      return sendJson(res, 500, { error: { code: 'E-PERSIST', message: 'Something went wrong; nothing was saved. Please retry.' } });
    }
  };
}

module.exports = { createHttpHandler, sendJson };
