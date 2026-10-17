'use strict';
// Called only with the disposable store-review session database. No provider,
// disk, GPS device, production database or notification dependency is allowed.
const feedback = require('./driver-feedback');
const tips = require('./driver-tips');
const fail = (message, statusCode) => { throw Object.assign(Error(message), { statusCode }); };
const EXAMPLE_DRIVER = 'isolated-customer-review-driver';

function prepare(db, customer, date, cart) {
  const base = {
    customerId: customer.id, customerName: customer.name, ...cart,
    discount: 0, deliveryFee: 3.99, total: Math.round((cart.subtotal + 3.99) * 100) / 100,
    method: 'delivery', serviceDate: date.toISOString().slice(0, 10), slot: '19:00',
    createdAt: date.toISOString(), reviewMode: true,
    payment: { status: 'PAID', provider: 'isolated-review-simulation', paidAt: date.toISOString() },
  };
  db.orders.push(
    { ...structuredClone(base), id: 'review-delivery-moving', number: 'TEST-LIVRAISON', status: 'out_for_delivery', kroklyDriver: { driverId: EXAMPLE_DRIVER, status: 'picked_up', pickedUpAt: date.toISOString() } },
    { ...structuredClone(base), id: 'review-delivery-completed', number: 'TEST-AVIS', status: 'delivered', kroklyDriver: { driverId: EXAMPLE_DRIVER, status: 'delivered', deliveredAt: date.toISOString() } },
  );
}

async function handle({ db, customer, route, method, readBody, date }) {
  const match = /^\/customer\/orders\/([^/]+)\/(delivery-tracking|delivery-feedback|tip)$/.exec(route);
  if (!match) return null;
  const order = db.orders.find(o => o.id === match[1] && o.customerId === customer.id);
  if (!order) fail('Commande fictive introuvable.', 404);
  const shadow = { ...order, reviewMode: false };
  const tipView = () => ({ ...tips.view(tips.forOrder(db, shadow), feedback.eligible(shadow)), reviewMode: true, simulated: true });
  if (match[2] === 'delivery-tracking' && method === 'GET') {
    // A deterministic illustrated route, never a collected personal position.
    const step = Math.floor(+date / 5000) % 12;
    return {
      protocol: 'bibou-customer-delivery-v1', status: order.status, reviewMode: true,
      timing: { available: true, remainingMinutes: 5 },
      position: order.status === 'out_for_delivery' ? { latitude: 49.490809 + step * .00004, longitude: .118444 + step * .00007, accuracy: 10, ageSeconds: 0, validForMs: 10000 } : null,
    };
  }
  if (match[2] === 'delivery-feedback' && ['GET', 'POST'].includes(method)) {
    const value = method === 'POST' ? feedback.save(db, shadow, await readBody(), date) : feedback.view(db, shadow);
    return { ...value, tips: tipView(), reviewMode: true };
  }
  if (match[2] === 'tip' && ['GET', 'POST'].includes(method)) {
    if (method === 'POST') {
      const tip = tips.create(db, shadow, await readBody(), date);
      tip.state = 'PAID';
      tip.paidAt = date.toISOString();
      tip.reviewMode = true;
      // No SumUp checkout and no verified-provider credit, even in the session.
    }
    return tipView();
  }
  fail('Action de test indisponible.', 405);
}
module.exports = { prepare, handle };
