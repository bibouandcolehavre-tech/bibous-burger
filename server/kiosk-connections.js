const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createKioskPairingStore } = require('./kiosk-pairing');
const SESSION_MS = 2 * 60 * 60 * 1000;

// Called within the server's database lock. Tokens and receiver secrets are
// never stored in plaintext; the short-lived QR proof is not a login token.
function createKioskConnectionStore(file, { secret, now = Date.now, capacity = 1000 } = {}) {
  const digest = value => crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
  function load() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data.pairings) || !Array.isArray(data.sessions)) throw Error('Invalid kiosk connection store');
      return { pairings: data.pairings, sessions: data.sessions.filter(([key, s]) => /^[a-f0-9]{64}$/.test(key) && s?.expiresAt > now() && typeof s.customerId === 'string' && /^[a-f0-9]{64}$/.test(s.deviceDigest)) };
    } catch (error) { if (error.code !== 'ENOENT') throw error; return { pairings: [], sessions: [] }; }
  }
  function save(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(tmp, file); }
    finally { try { fs.unlinkSync(tmp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  }
  function change(action) {
    const data = load(), pairing = createKioskPairingStore({ now, capacity, saved: data.pairings });
    const result = action(pairing, data); data.pairings = pairing.snapshot(); save(data); return result;
  }
  function read(token, deviceToken) {
    if (!/^kiosk\.[A-Za-z0-9_-]{43}$/.test(token || '') || typeof deviceToken !== 'string' || deviceToken.length < 32) return null;
    const session = new Map(load().sessions).get(digest(token));
    return session && session.deviceDigest === digest(deviceToken) ? session : null;
  }
  return {
    guest(deviceToken) {
      if (typeof deviceToken !== 'string' || deviceToken.length < 32) throw Error('Accès borne requis.');
      return change((pairing, data) => {
        if (data.sessions.length >= capacity) throw Error('Trop de sessions en cours.');
        const token = `kiosk.${crypto.randomBytes(32).toString('base64url')}`;
        const session = { guest:true, customerId:`kiosk-guest-${crypto.randomUUID()}`, id:crypto.randomUUID(), deviceDigest:digest(deviceToken), expiresAt:now()+SESSION_MS, recoveredOrders:[] };
        data.sessions.push([digest(token), session]);
        return { status:'connected', token, session };
      });
    },
    create: name => change(pairing => pairing.create(name)),
    inspect: proof => change(pairing => pairing.inspect(proof)),
    approve: (proof, customerId) => change(pairing => pairing.approve(proof, customerId)),
    cancel: (id, reader) => change(pairing => pairing.cancel(id, reader)),
    poll(id, reader, deviceToken) {
      return change((pairing, data) => {
        const status = pairing.poll(id, reader);
        if (status.status !== 'approved') return status;
        if (data.sessions.length >= capacity) throw Error('Trop de sessions en cours.');
        const customer = pairing.redeem(id, reader), token = `kiosk.${crypto.randomBytes(32).toString('base64url')}`;
        const session = { customerId: customer.customerId, id: crypto.randomUUID(), deviceDigest: digest(deviceToken), expiresAt: now() + SESSION_MS, recoveredOrders: [] };
        data.sessions.push([digest(token), session]);
        return { status: 'connected', token, session };
      });
    },
    read,
    recoverOrder(token, deviceToken, order) {
      const session = read(token, deviceToken);
      if (!session || order.customerId !== session.customerId || order.kioskDeviceDigest !== session.deviceDigest) return false;
      change((pairing, data) => { const entry = new Map(data.sessions).get(digest(token)); entry.recoveredOrders = [...new Set([...(entry.recoveredOrders || []), order.id])].slice(-10); });
      session.recoveredOrders = [...new Set([...(session.recoveredOrders || []), order.id])];
      return session;
    },
    revoke(token, deviceToken) { if (read(token, deviceToken)) change((pairing, data) => { data.sessions = data.sessions.filter(([key]) => key !== digest(token)); }); },
  };
}

function kioskRequestAllowed(method, route) {
  if (method === 'GET') return [
    '/api/health', '/api/catalog', '/api/service-modules', '/api/availability', '/api/reservation-availability',
    '/api/auth/me', '/api/customer/orders', '/api/customer/reservations', '/api/customer/rewards',
    '/api/customer/wheel', '/api/customer/crm', '/api/bibou-plus/status', '/api/integrations/sumup/status',
  ].includes(route) || /^\/api\/(customer\/payment-attempts|payments\/sumup-checkout)\/[^/]+$/.test(route);
  return method === 'POST' && ['/api/orders', '/api/kiosk/terminal/prepare', '/api/kiosk/terminal/verify', '/api/kiosk-pairing/end', '/api/customer/wheel/spin', '/api/promotions/validate'].includes(route);
}
function kioskCustomerView(customer) {
  if (customer.isKioskGuest) return { id:customer.id, name:'Client borne', phone:'', points:0, weeklyOrders:0, isKioskGuest:true };
  const view = Object.fromEntries(['id', 'name', 'firstName', 'lastName', 'phone', 'points', 'weeklyOrders', 'weeklyProgramPoints', 'bibouPlusExpiresAt'].filter(key => Object.hasOwn(customer, key)).map(key => [key, customer[key]]));
  if (customer.welcomeReward) view.welcomeReward = { type: customer.welcomeReward.type, status: customer.welcomeReward.status, discountRate: customer.welcomeReward.discountRate };
  return view;
}
function orderInKioskSession(order, session) { return !session || Boolean(order && (order.kioskSessionId === session.id || session.recoveredOrders?.includes(order.id))); }
function kioskWheelDatabase(database, session, customerId) {
  if (!session) return database;
  const orders=database.orders.filter(order=>order.customerId===customerId && orderInKioskSession(order,session));
  const ids=new Set(orders.map(order=>order.id));
  return {...database, orders, customers:[], wheelSpins:(database.wheelSpins||[]).filter(spin=>spin.customerId===customerId && ids.has(spin.orderId))};
}
module.exports = { createKioskConnectionStore, kioskRequestAllowed, kioskCustomerView, orderInKioskSession, kioskWheelDatabase, SESSION_MS };
