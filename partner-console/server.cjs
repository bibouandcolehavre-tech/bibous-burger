'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const allowed = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']], ['/model.js', ['model.js', 'text/javascript']], ['/app.js', ['app.js', 'text/javascript']]]);
function createServer() {
  return http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end('Local access only'); }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    const target = allowed.get((req.url || '').split('?')[0]);
    if (!target) { res.writeHead(404); return res.end('Not found'); }
    const body = fs.readFileSync(path.join(__dirname, target[0]));
    res.writeHead(200, { 'Content-Type': `${target[1]}; charset=utf-8`, 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}
if (require.main === module) {
  const server = createServer();
  server.listen(Number(process.env.PARTNER_PREVIEW_PORT || 4176), '127.0.0.1', () => console.log(`Maquette locale uniquement : http://127.0.0.1:${server.address().port}`));
}
module.exports = { createServer };
