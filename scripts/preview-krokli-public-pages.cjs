'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { page } = require('../server/krokli-public-pages');
const output = path.resolve(__dirname, '../work', `krokli-public-pages-${new Date().toISOString().replace(/[:.]/g,'-')}`);
fs.mkdirSync(output, { recursive: true });
for (const kind of ['privacy','support']) fs.writeFileSync(path.join(output, `${kind}.html`), page(kind), { flag: 'wx' });
const server = http.createServer((request, response) => {
  const kind = /^\/driver\/(privacy|support)$/.exec(request.url)?.[1];
  if (!kind) { response.writeHead(404); return response.end(); }
  response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  response.end(page(kind));
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({preview:`http://127.0.0.1:${server.address().port}/driver/privacy`,output})));
