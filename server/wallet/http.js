const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('./core');
const providers = require('./providers');
const QRCode = require('qrcode');
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const knownFiles = { '/club': ['index.html', 'text/html; charset=utf-8'], '/club/': ['index.html', 'text/html; charset=utf-8'],
  '/club/club.js': ['club.js', 'application/javascript; charset=utf-8'], '/club/club.css': ['club.css', 'text/css; charset=utf-8'],
  '/club/wordmark.png': ['assets/wordmark.png', 'image/png'], '/club/google-logo.png': ['assets/google-logo.png', 'image/png'] };
function createWalletHttp({ config, secret, transact, readBody, authenticatedCustomer, authenticatedDashboard, send, renderApple = providers.applePass, saveGoogle = providers.googleSaveLink }) {
  const secure = config.origin?.startsWith('https:');
  const protect = response => { response.setHeader('Cache-Control', 'no-store, private'); response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Content-Type-Options', 'nosniff'); };
  const json = (response, status, data) => {
    // Wallet sessions and Save links are never cross-origin-readable.
    protect(response); response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data));
  };
  const binary = (response, type, data) => { protect(response); response.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length }); response.end(data); };
  const ownCustomer = (request, database) => {
    if (String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').startsWith('kiosk.')) throw core.fail(403, 'Ouvre ta carte depuis ton téléphone personnel.');
    const customer = core.customerForCookie(request, database, secret) || authenticatedCustomer(request, database);
    if (!customer || !database.customers.includes(customer) || !customer.phoneVerifiedAt) throw core.fail(401, 'Vérifie ton numéro par SMS pour retrouver ta carte.');
    return customer;
  };
  const verifyApple = (request, serial) => {
    if (!core.safeEqual(request.headers.authorization, `ApplePass ${core.passAuth(serial, secret)}`)) throw core.fail(401, 'Accès à la carte refusé.');
  };
  return async (request, response, url) => {
    if (!knownFiles[url.pathname] && !url.pathname.startsWith('/api/wallet') && url.pathname !== '/api/dashboard/wallet/identify') return false;
    try {
      if (knownFiles[url.pathname]) {
        if (!['GET', 'HEAD'].includes(request.method)) throw core.fail(405, 'Lecture seule.');
        const [file, type] = knownFiles[url.pathname]; const body = await fs.readFile(path.join(__dirname, file));
        protect(response); response.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': csp, 'Content-Length': body.length });
        response.end(request.method === 'HEAD' ? undefined : body); return true;
      }
      if (!config.enabled) throw core.fail(503, 'La carte Wallet Bibou est en préparation. Tes points restent disponibles dans ton compte Bibou.');
      protect(response);
      if (url.pathname === '/api/wallet/status' && request.method === 'GET') {
        json(response, 200, { enabled: true, apple: config.apple.enabled, google: config.google.enabled }); return true;
      }
      if (url.pathname.startsWith('/api/wallet/apple/v1/')) {
        if (!config.apple.enabled) throw core.fail(503, 'La carte Apple Wallet est en préparation.');
        const passMatch = /^\/api\/wallet\/apple\/v1\/passes\/([^/]+)\/([a-f0-9]{32})$/.exec(url.pathname);
        if (passMatch && request.method === 'GET') {
          const [, passType, serial] = passMatch;
          if (passType !== config.apple.passType) throw core.fail(404, 'Carte introuvable.'); verifyApple(request, serial);
          const pass = await transact(database => core.findPass(database, serial));
          if (!pass) throw core.fail(404, 'Carte introuvable.');
          binary(response, 'application/vnd.apple.pkpass', renderApple(pass, config, secret)); return true;
        }
        const registration = /^\/api\/wallet\/apple\/v1\/devices\/([A-Za-z0-9-]{16,200})\/registrations\/([^/]+)\/([a-f0-9]{32})$/.exec(url.pathname);
        if (registration && ['POST', 'DELETE'].includes(request.method)) {
          const [, deviceId, passType, serial] = registration;
          if (passType !== config.apple.passType) throw core.fail(404, 'Carte introuvable.'); verifyApple(request, serial);
          const input = request.method === 'POST' ? await readBody(request) : {};
          if (request.method === 'POST' && !/^[a-f0-9]{32,512}$/i.test(input.pushToken)) throw core.fail(400, 'Installation invalide.');
          const result = await transact(database => {
            const pass = core.findPass(database, serial); if (!pass) throw core.fail(404, 'Carte introuvable.');
            const devices = pass.wallet.devices ||= []; const index = devices.findIndex(d => d.deviceId === deviceId);
            if (request.method === 'DELETE') { if (index >= 0) devices.splice(index, 1); return { status: 200 }; }
            if (index < 0 && devices.length >= 10) throw core.fail(409, 'Limite d’installations atteinte.');
            const record = { deviceId, pushToken: input.pushToken, notifiedRevision: 0 };
            if (index < 0) devices.push(record); else if (devices[index].pushToken !== input.pushToken) devices[index] = record;
            return { status: index < 0 ? 201 : 200 };
          }, true);
          json(response, result.status, {}); return true;
        }
        const list = /^\/api\/wallet\/apple\/v1\/devices\/([A-Za-z0-9-]{16,200})\/registrations\/([^/]+)$/.exec(url.pathname);
        if (list && request.method === 'GET') {
          if (list[2] !== config.apple.passType) throw core.fail(404, 'Carte introuvable.');
          const tag = url.searchParams.get('passesUpdatedSince');
          if (tag !== null && !/^\d{1,15}$/.test(tag)) throw core.fail(400, 'Référence invalide.');
          const result = await transact(database => {
            const wallets = [...database.customers.map(c => c.clubWallet).filter(Boolean), ...(database.clubWalletRevocations || [])];
            return { serialNumbers: wallets.filter(w => w.devices?.some(d => d.deviceId === list[1]) && w.revision > Number(tag || 0)).map(w => w.serial), lastUpdated: String(database.clubWalletRevision || 0) };
          });
          if (!result.serialNumbers.length) { response.writeHead(204); response.end(); } else json(response, 200, result); return true;
        }
        if (url.pathname === '/api/wallet/apple/v1/log' && request.method === 'POST') {
          await readBody(request); // Deliberately discard device logs; they may contain personal data.
          json(response, 200, {}); return true;
        }
        throw core.fail(404, 'Carte introuvable.');
      }
      if (url.pathname === '/api/dashboard/wallet/identify') {
        if (request.method !== 'POST') throw core.fail(405, 'Action indisponible.');
        if (!authenticatedDashboard(request)) throw core.fail(401, 'Accès restaurant requis.');
        const input = await readBody(request);
        const member = await transact(database => core.scan(database, input.barcode));
        if (!member) throw core.fail(404, 'Carte introuvable ou désactivée.');
        json(response, 200, { member, permission: 'identify-only' }); return true;
      }
      if (['POST', 'DELETE'].includes(request.method)) core.assertSameOrigin(request, config.origin);
      if (url.pathname === '/api/wallet/session' && request.method === 'POST') {
        const customerId = await transact(database => {
          // Exchange an existing, SMS-authenticated session for Wallet-only scope.
          const customer = authenticatedCustomer(request, database);
          if (!customer || !database.customers.includes(customer) || !customer.phoneVerifiedAt || String(request.headers.authorization || '').includes('kiosk.')) throw core.fail(401, 'Vérifie ton numéro par SMS pour retrouver ta carte.');
          return customer.id;
        });
        response.setHeader('Set-Cookie', core.walletCookie(customerId, secret, { secure })); json(response, 200, { ok: true }); return true;
      }
      if (url.pathname === '/api/wallet/session' && request.method === 'DELETE') {
        response.setHeader('Set-Cookie', `${core.COOKIE}=; Path=/api/wallet; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
        json(response, 200, { ok: true }); return true;
      }
      if (url.pathname === '/api/wallet/member' && request.method === 'GET') {
        const member = await transact(database => { const customer = ownCustomer(request, database); core.ensureMembership(database, customer); return core.memberView(customer); }, true);
        json(response, 200, { member, apple: config.apple.enabled, google: config.google.enabled }); return true;
      }
      if (url.pathname === '/api/wallet/qr.png' && request.method === 'GET') {
        const member = await transact(database => { const customer = ownCustomer(request, database); core.ensureMembership(database, customer); return core.memberView(customer); }, true);
        binary(response, 'image/png', await QRCode.toBuffer(member.barcode, { width: 320, margin: 3, errorCorrectionLevel: 'M' })); return true;
      }
      if (url.pathname === '/api/wallet/apple.pkpass' && request.method === 'GET') {
        if (!config.apple.enabled) throw core.fail(503, 'La carte Apple Wallet est en préparation.');
        const pass = await transact(database => { const customer = ownCustomer(request, database); core.ensureMembership(database, customer); return core.findPass(database, customer.clubWallet.serial); }, true);
        const bytes = renderApple(pass, config, secret);
        await transact(database => { const latest = core.findPass(database, pass.memberId); if (latest && !latest.voided) latest.wallet.appleIssued = true; }, true);
        response.setHeader('Content-Disposition', 'attachment; filename="Club-Bibou.pkpass"'); binary(response, 'application/vnd.apple.pkpass', bytes); return true;
      }
      if (url.pathname === '/api/wallet/google' && request.method === 'POST') {
        if (!config.google.enabled) throw core.fail(503, 'La carte Google Wallet est en préparation.');
        const link = await transact(database => { const customer = ownCustomer(request, database); core.ensureMembership(database, customer);
          const link = saveGoogle(core.findPass(database, customer.clubWallet.serial), config); customer.clubWallet.googleIssued = true; return link; }, true);
        json(response, 200, { url: link }); return true;
      }
      throw core.fail(404, 'Page introuvable.');
    } catch (error) {
      json(response, [400, 401, 403, 404, 405, 409, 413, 429, 503].includes(error.statusCode) ? error.statusCode : 503,
        { error: error.statusCode ? error.message : 'Ta carte est momentanément indisponible. Tes points restent conservés dans ton compte Bibou.' });
      return true;
    }
  };
}
module.exports = { createWalletHttp };
