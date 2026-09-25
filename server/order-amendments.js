const crypto = require('node:crypto');
const { validateAndPriceOrderItems, assertStoredOrderAvailable } = require('./catalog');
const { bibouPlusOrderPricing } = require('./bibou-plus');
const { serviceSlotInstant } = require('./availability');
const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
const cents = n => Math.round(n * 100);
const snapshot = o => structuredClone({ items: o.items, subtotal: o.subtotal, discount: o.discount, discountRate: o.discountRate, deliveryFee: o.deliveryFee, total: o.total });
const revision = order => order.amendment?.revision || 0;
function editable(order, input, now) {
  if (order.payment?.status !== 'PAID' || !['confirmed', 'awaiting_customer'].includes(order.status) || order.amendment?.status === 'accepted') fail('Seule une nouvelle commande, avant acceptation, peut être modifiée.');
  if (!order.customerId) fail('Le compte client ne permet plus une revalidation.');
  if (revision(order) >= 10) fail('Dix propositions ont déjà été envoyées. Contactez le client.');
  if (input.revision !== revision(order)) fail('La commande a changé. Actualisez avant de continuer.');
  const instant = serviceSlotInstant(order.serviceDate, order.slot, order.method);
  if (!instant || instant.getTime() <= now) fail('Le créneau est passé. Contactez le client.');
}
function preview(order, input, stock = {}, now = Date.now()) {
  editable(order, input, now);
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 300) fail('Indiquez le motif de la modification (300 caractères maximum).', 400);
  const cart = validateAndPriceOrderItems(input.items, stock);
  const pricing = bibouPlusOrderPricing({ subtotal: cart.subtotal, deliveryFee: order.standardDeliveryFee ?? order.deliveryFee, active: order.bibouPlusApplied, discountRate: order.discountRate || 0 });
  if (cents(pricing.total) > cents(order.total)) fail('Le nouveau total ne peut pas dépasser le montant payé. Choisissez un remplacement sans supplément.', 400);
  if (JSON.stringify(cart.items) === JSON.stringify(order.items)) fail('Le panier proposé est identique à la commande.', 400);
  return { ...pricing, items: cart.items, reason: input.reason.trim(), refundAmount: (cents(order.total) - cents(pricing.total)) / 100 };
}
function propose(order, input, stock = {}, now = Date.now()) {
  const proposal = preview(order, input, stock, now);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
  if (input.previewFingerprint !== fingerprint) fail('Le panier ou les prix ont changé. Vérifiez à nouveau l’aperçu.');
  order.amendmentHistory ||= [];
  if (order.amendment) order.amendmentHistory.push({ ...order.amendment, status: 'superseded', resolvedAt: new Date(now).toISOString() });
  order.amendment = { revision: revision(order) + 1, status: 'pending', original: snapshot(order), proposal, fingerprint, createdAt: new Date(now).toISOString(), expiresAt: new Date(Math.min(now + 30 * 60000, serviceSlotInstant(order.serviceDate, order.slot, order.method).getTime())).toISOString() };
  order.status = 'awaiting_customer';
  order.updatedAt = new Date(now).toISOString();
  return order.amendment;
}
function previewWithFingerprint(...args) {
  const proposal = preview(...args);
  return { proposal, fingerprint: crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex') };
}
function setRefund(order, amount) {
  if (amount > 0) order.refund = { amount, status: 'due', source: 'order_amendment' };
}
function cancel(order, status, now = Date.now()) {
  if (order.amendment?.status === 'pending') Object.assign(order.amendment, { status, resolvedAt: new Date(now).toISOString() });
  order.status = 'cancelled';
  order.updatedAt = new Date(now).toISOString();
  const amount = order.paidTotal ?? order.total;
  const alreadyRefunded = order.refund?.status === 'recorded' ? order.refund.amount : 0;
  if (alreadyRefunded) {
    order.refundHistory ||= [];
    order.refundHistory.push(order.refund);
  }
  setRefund(order, (cents(amount) - cents(alreadyRefunded)) / 100);
}
function decide(order, input, stock = {}, now = Date.now()) {
  const amendment = order.amendment;
  if (!amendment || input.revision !== amendment.revision || !['accept', 'refuse'].includes(input.decision)) fail('Cette proposition n’est plus actuelle. Actualise le suivi.');
  const result = input.decision === 'accept' ? 'accepted' : 'refused';
  if (amendment.status === result && (result !== 'accepted' || order.status !== 'cancelled')) return false; // Safe replay after a lost response.
  if (order.status !== 'awaiting_customer' || amendment.status !== 'pending' || Date.parse(amendment.expiresAt) <= now) fail('Cette proposition a expiré ou a déjà reçu une réponse.');
  if (input.decision === 'refuse') { cancel(order, 'refused', now); return true; }
  assertStoredOrderAvailable(amendment.proposal.items, stock);
  order.paidTotal ??= order.total;
  const { items, subtotal, discount, discountRate, standardDeliveryFee, deliveryFee, total } = amendment.proposal;
  Object.assign(order, { items: structuredClone(items), subtotal, discount, discountRate, standardDeliveryFee, deliveryFee, total, status: 'confirmed', updatedAt: new Date(now).toISOString() });
  Object.assign(amendment, { status: 'accepted', resolvedAt: new Date(now).toISOString() });
  setRefund(order, amendment.proposal.refundAmount);
  return true;
}
function recordRefund(order, input, now = Date.now()) {
  if (!order.refund || input.amount !== order.refund.amount || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.trim().length > 120) fail('Indiquez la référence du remboursement effectué et vérifiez le montant.', 400);
  if (order.refund.status === 'recorded') return;
  Object.assign(order.refund, { status: 'recorded', reference: input.reference.trim(), recordedAt: new Date(now).toISOString() });
}
module.exports = { preview: previewWithFingerprint, propose, decide, cancel, recordRefund };
