// Isolated audible/visual QA. No real orders, network providers or credentials.
const http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path');
if (process.env.NODE_ENV !== 'test') throw Error('NODE_ENV=test required');
let orders = [], number = 900, origin, failUpdates = false;
const add = () => orders.push({ id: 'test-' + (++number), number, status: 'confirmed', payment: { status: 'PAID' }, createdAt: new Date().toISOString(), serviceDate: '2099-01-01', slot: '19:00', total: 3.9, subtotal: 3.9, customerName: 'Commande fictive — test son', method: 'pickup', items: [{ name: 'Frites de test', quantity: 1, price: 3.9, options: [] }] });
add();
const root = path.resolve(__dirname, '../../restaurant-dashboard');
const server = http.createServer(async (req, res) => {
  const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/control') { res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); return res.end('<!doctype html><html lang="fr"><meta charset="utf-8"><h1>Tests locaux : aucune vraie commande</h1><p>Mot de passe du tableau fictif : test-only</p><button data-action="add">Ajouter une commande fictive</button><button data-action="empty">Terminer les commandes fictives</button><button data-action="fail">Simuler un échec d’acceptation</button><a href="/">Tableau fictif</a><p id="result"></p><script>document.querySelectorAll("button").forEach(b=>b.onclick=async()=>{await fetch("/control/"+b.dataset.action,{method:"POST"});document.querySelector("#result").textContent=b.textContent+" : fait";});</script></html>'); }
    if (req.method === 'POST' && url.pathname.startsWith('/control/')) { const action = url.pathname.split('/').pop(); if (action === 'add') add(); if (action === 'empty') orders = []; failUpdates = action === 'fail'; return json({ ok: true }); }
    if (url.pathname === '/api/dashboard/auth/login') return json({ token: 'local-alert-test-only' });
    if (url.pathname.startsWith('/api/')) {
      if (req.headers.authorization !== 'Bearer local-alert-test-only') return json({}, 401);
      if (url.pathname === '/api/dashboard/orders') return json({ orders, revenue: { today: 0, week: 0, month: 0 } });
      if (url.pathname === '/api/dashboard/reservations') return json({ reservations: [] });
      if (url.pathname === '/api/dashboard/reward-claims') return json({ claims: [] });
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/dashboard/orders/')) {
        if (failUpdates) return json({ error: 'Échec fictif' }, 503);
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const order = orders.find(item => item.id === url.pathname.split('/').pop());
        if (!order) return json({}, 404);
        order.status = JSON.parse(Buffer.concat(chunks).toString()).status; return json({ order });
      }
      return json({}, 404);
    }
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep)) return json({}, 403);
    const extension = path.extname(file); let content = await fs.readFile(file, 'utf8');
    if (extension === '.js') content = content.replaceAll('https://bibous-burger.onrender.com/api', origin + '/api').replaceAll('http://localhost:3001/api', origin + '/api');
    res.writeHead(200, { 'Content-Type': extension === '.js' ? 'text/javascript' : extension === '.css' ? 'text/css' : 'text/html;charset=utf-8', 'Cache-Control': 'no-store' }); res.end(content);
  } catch { json({ error: 'Test local indisponible' }, 500); }
});
server.listen(0, '127.0.0.1', () => { origin = 'http://127.0.0.1:' + server.address().port; console.log(origin); });
