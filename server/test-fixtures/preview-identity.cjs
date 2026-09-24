// Local QA only: isolated synthetic accounts and mocked SMS, no paid provider.
const fs = require('node:fs/promises'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
if (process.env.NODE_ENV !== 'test') throw Error('NODE_ENV=test required');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-identity-preview-')), file = path.join(dir, 'data.json');
  await fs.writeFile(file, JSON.stringify({ customers: [{ id: 'old-test', name: '', phone: '+33600000001', points: 700, weeklyOrders: 2 }], orders: [], nextCustomerId: 2, nextOrderNumber: 1 }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'sms-provider.cjs'), path.join(__dirname, '../server.js')], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, SESSION_SECRET: 'local-identity-only', TWILIO_ACCOUNT_SID: 'FAKE', TWILIO_AUTH_TOKEN: 'FAKE', TWILIO_VERIFY_SERVICE_SID: 'FAKE' }, stdio: ['ignore', 'pipe', 'inherit'] });
  const api = await new Promise((resolve, reject) => { child.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:\d+/); if (m) resolve(m[0]); }); child.on('error', reject); child.on('exit', code => reject(Error('API exit ' + code))); });
  const root = path.resolve(__dirname, '../../dist'); let origin;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const result = await fetch(api + req.url, { method: req.method, headers: { Authorization: req.headers.authorization || '', 'Content-Type': 'application/json' }, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
        res.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(Buffer.from(await result.arrayBuffer()));
      }
      const filePath = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!filePath.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      let content = await fs.readFile(filePath); const ext = path.extname(filePath);
      if (ext === '.js') content = Buffer.from(content.toString().replaceAll('https://bibous-burger.onrender.com/api', origin + '/api').replaceAll('http://localhost:3001/api', origin + '/api'));
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' })[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
    } catch { res.writeHead(503); res.end('Test local indisponible'); }
  });
  server.listen(0, '127.0.0.1', () => { origin = 'http://127.0.0.1:' + server.address().port; console.log(origin); });
  const stop = () => { child.kill(); server.close(); process.exit(0); }; process.once('SIGTERM', stop); process.once('SIGINT', stop);
})();
