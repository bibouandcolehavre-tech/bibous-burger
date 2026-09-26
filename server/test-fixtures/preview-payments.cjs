// Manual browser QA only. All data and provider responses are fictitious.
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createCustomerSession } = require('../customer-session');
const { orderFingerprint } = require('../order-attempt');
const { parisDateKey } = require('../availability');
if (process.env.NODE_ENV !== 'test') throw new Error('NODE_ENV=test required');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-payment-preview-'));
  const databaseFile = path.join(directory, 'data.json');
  const providerFile = path.join(directory, 'provider.json');
  const customerId = 'preview-customer';
  const secret = 'preview-only-never-production';
  const token = createCustomerSession(customerId, secret);
  const requestId = 'attempt-preview-recovery-0001';
  const input = { customerId, method: 'pickup', serviceDate: parisDateKey(new Date(Date.now() + 86400000)), slot: '19:00', items: [{ productId: 'classique', quantity: 1, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' }, { groupId: 'sauces', id: 'mayo' }] }] };
  const attempt = { version: 1, customerId, requestId, kind: 'order', input, createdAt: Date.now() };
  const seed = async scenario => {
    const payment = { checkoutId: 'preview-checkout', checkoutReference: 'preview-reference', merchantCode: 'TEST', status: 'PENDING', checkoutUrl: 'https://checkout.sumup.com/pay/preview-only', validUntil: new Date(Date.now() + 900000).toISOString() };
    const order = { id: 'order-1', number: 1, customerId, customerName: 'Camille Démonstration', requestId, requestFingerprint: orderFingerprint(input), items: [{ productId: 'classique', name: 'Classique', quantity: 1, unitPrice: 10, total: 10, selections: input.items[0].selections }], subtotal: 10, discount: 0, total: 10, method: 'pickup', serviceDate: input.serviceDate, slot: input.slot, status: scenario === 'cancelled' ? 'cancelled' : 'awaiting_payment', createdAt: new Date().toISOString(), payment };
    const status = scenario === 'paid' || scenario === 'cancelled' ? 'PAID' : scenario === 'expired' ? 'EXPIRED' : 'PENDING';
    await fs.writeFile(databaseFile, JSON.stringify({ nextOrderNumber: 2, customers: [{ id: customerId, firstName: 'Camille', lastName: 'Démonstration', name: 'Camille Démonstration', phone: '+33600000000', points: 0, weeklyOrders: 0, welcomeReward: { status: 'used' } }], orders: ['uncreated', 'shopping'].includes(scenario) ? [] : [order] }));
    await fs.writeFile(providerFile, JSON.stringify({ fail: scenario === 'offline', checkouts: { 'preview-checkout': { id: 'preview-checkout', checkout_reference: 'preview-reference', amount: 10, currency: 'EUR', merchant_code: 'TEST', status, hosted_checkout_url: payment.checkoutUrl } } }));
  };
  await seed('pending');
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'sumup-provider.cjs'), path.join(__dirname, '../server.js')], {
    cwd: directory,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: databaseFile, FAKE_SUMUP_FILE: providerFile, SESSION_SECRET: secret, SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'TEST', SUMUP_RETURN_URL: 'https://example.invalid/return', SUMUP_REDIRECT_URL: 'https://example.invalid/app' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const api = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', value => { const match = String(value).match(/http:\/\/localhost:\d+/); if (match) resolve(match[0]); });
    child.on('exit', code => reject(new Error('Preview API exited ' + code)));
  });
  const dist = path.resolve(__dirname, '../../dist');
  let origin;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/fixtures') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        return response.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Test de reprise fictif</title><h1>Tests sans paiement ni SMS réels</h1>${['pending','paid','cancelled','expired','offline','uncreated','shopping'].map(value => `<button data-scenario="${value}">${value}</button>`).join(' ')}<script>document.querySelectorAll('button').forEach(button => button.onclick=async()=>{await fetch('/scenario/'+button.dataset.scenario,{method:'POST'});localStorage.setItem('bibousCustomerSession',${JSON.stringify(token)});if(button.dataset.scenario==='shopping')localStorage.removeItem('bibousPaymentAttempt');else localStorage.setItem('bibousPaymentAttempt',${JSON.stringify(JSON.stringify(attempt))});location.href='/';});</script></html>`);
      }
      if (request.method === 'POST' && /^\/scenario\/(pending|paid|cancelled|expired|offline|uncreated|shopping)$/.test(url.pathname)) {
        await seed(url.pathname.split('/').pop()); response.writeHead(204); return response.end();
      }
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const result = await fetch(api + request.url, { method: request.method, headers: { 'Content-Type': 'application/json', Authorization: request.headers.authorization || '' }, ...(['GET','HEAD'].includes(request.method) ? {} : { body: Buffer.concat(chunks) }) });
        response.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return response.end(Buffer.from(await result.arrayBuffer()));
      }
      const filename = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!filename.startsWith(dist + path.sep)) { response.writeHead(403); return response.end(); }
      let contents = await fs.readFile(filename);
      const ext = path.extname(filename);
      if (ext === '.js') contents = Buffer.from(contents.toString().replaceAll('http://localhost:3001/api', origin + '/api').replaceAll('https://bibous-burger.onrender.com/api', origin + '/api'));
      response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' })[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(contents);
    } catch { response.writeHead(503); response.end('Preview unavailable'); }
  });
  server.listen(0, '127.0.0.1', () => { origin = 'http://127.0.0.1:' + server.address().port; console.log(origin + '/fixtures'); });
  const stop = () => { child.kill(); server.close(); process.exit(0); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
})();
