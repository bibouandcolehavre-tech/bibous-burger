'use strict';
const crypto = require('node:crypto');
const { parisDateKey, slotsForDate, scheduleOverride } = require('./availability');
const stock = require('./quantity-stock');
const { PRODUCT_CATALOG } = require('./catalog');

// Owner-authorized, bounded trial. This bonus never changes the paid basket,
// its prices, loyalty, contest score or earned wheel turns.
const CAMPAIGN = Object.freeze({ id: 'first-five-lunch-20261103', startDate: '2026-11-03', endDate: '2026-11-09', limit: 5,
  startSlot: '12:00', endSlot: '14:00' });
const drinkIds = Object.keys(PRODUCT_CATALOG).filter(id => id.startsWith('drink-') && PRODUCT_CATALOG[id].price === 1.8);
const groups = [['frites-maison'], ['tenders-xl-3'], drinkIds];
const minute = date => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
const inDates = day => day >= CAMPAIGN.startDate && day <= CAMPAIGN.endDate;
const ledger = db => db.lunchGiftCampaigns?.[CAMPAIGN.id]?.awards || [];
function identity(customer, secret) {
  const phone = String(customer?.phone || '').replace(/\D/g, '').replace(/^33/, '0');
  if (!/^0[67]\d{8}$/.test(phone) || !secret) return null;
  return crypto.createHmac('sha256', secret).update(CAMPAIGN.id + ':' + phone).digest('hex');
}
function eligible(order, customer, now = new Date()) {
  if (!order || !customer || order.payment?.status !== 'PAID' || order.status !== 'awaiting_payment' || order.lunchGift ||
      order.reviewMode || order.isTest || order.isReview || customer.reviewMode || customer.isKioskGuest ||
      order.kioskGuest || order.kioskImmediate || order.kioskSessionId || order.kioskDeviceDigest ||
      order.source === 'uber' || order.externalSource || order.promotion?.sourceContestPrize ||
      !['pickup', 'delivery'].includes(order.method) || order.payment.provider !== 'sumup' ||
      !Array.isArray(order.items) || !order.items.length ||
      !(Number(order.subtotal) - Number(order.discount || 0) > 0) || !(Number(order.total) > 0) || order.refund) return false;
  const paid = new Date(order.payment.paidAt), created = new Date(order.createdAt);
  if (!Number.isFinite(+paid) || !Number.isFinite(+created) || +paid > +now || +created > +paid) return false;
  const day = parisDateKey(now), slot = String(order.slot || '').slice(0, 5);
  return inDates(day) && order.serviceDate === day && parisDateKey(paid) === day && parisDateKey(created) === day &&
    /^\d{2}:\d{2}$/.test(slot) && slot >= CAMPAIGN.startSlot && slot < CAMPAIGN.endSlot && minute(now) < CAMPAIGN.endSlot;
}
function availableGroups(db, flags = {}) {
  if (flags === null) return [];
  return groups.map(ids => ids.filter(id => flags[id] !== false && stock.available(db, id) !== 0)).filter(ids => ids.length);
}
function award(db, order, customer, { now = new Date(), flags = {}, secret, randomInt = crypto.randomInt } = {}) {
  if (order.lunchGift?.campaignId === CAMPAIGN.id) return order.lunchGift;
  if (!eligible(order, customer, now)) return null;
  const key = identity(customer, secret), day = order.serviceDate;
  if (!key) return null;
  const previous = ledger(db).filter(a => a.day === day);
  if (previous.length >= CAMPAIGN.limit || previous.some(a => a.identityDigest === key || a.orderId === order.id)) return null;
  // Commit the paid basket's existing stock hold before selecting the extra.
  stock.reconcile(db, now);
  const available = availableGroups(db, flags);
  const pool = available.length ? available[randomInt(available.length)] : [];
  const productId = pool.length ? pool[randomInt(pool.length)] : null;
  const label = productId ? productId === 'frites-maison' ? 'Une portion de frites maison offerte' : productId === 'tenders-xl-3' ? 'Trois tenders XL offerts' : `${PRODUCT_CATALOG[productId].name} offert` : 'Cadeau du midi à choisir avec le restaurant';
  const gift = { campaignId: CAMPAIGN.id, day, rank: previous.length + 1, quantity: 1, productId, label,
    status: productId ? 'attached' : 'choice_required', awardedAt: now.toISOString() };
  if (productId) {
    // A separate physical gift: debit stock once, without making it a paid
    // item, discount, new coupon, points source or amendment target.
    const giftItem = { productId, quantity: 1, options: [] };
    stock.applyChange(db, { ...order, items: [...order.items, giftItem] }, order.items, now);
    gift.stockRecorded = true;
  }
  db.lunchGiftCampaigns ||= {};
  db.lunchGiftCampaigns[CAMPAIGN.id] ||= { awards: [] };
  db.lunchGiftCampaigns[CAMPAIGN.id].awards.push({ day, rank: gift.rank, orderId: order.id, identityDigest: key,
    productId, awardedAt: gift.awardedAt });
  order.lunchGift = gift;
  return gift;
}
function resolve(db, order, input, flags, now = new Date()) {
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
  if (!order || order.payment?.status !== 'PAID' || ['cancelled', 'delivered', 'out_for_delivery'].includes(order.status)) fail('Cette commande ne permet plus de choisir le cadeau.');
  if (!input || Object.keys(input).some(k => k !== 'productId') || !groups.flat().includes(input.productId)) fail('Choisissez un des cadeaux du midi.');
  const gift = order.lunchGift;
  if (gift?.campaignId !== CAMPAIGN.id) fail('Cette commande ne bénéficie pas du cadeau.');
  if (gift.status === 'attached' && gift.productId === input.productId) return gift;
  if (gift.status !== 'choice_required') fail('Le cadeau a déjà été ajouté.');
  if (!availableGroups(db, flags).flat().includes(input.productId)) fail('Ce cadeau est indisponible. Vérifiez le stock.');
  const productId = input.productId;
  stock.applyChange(db, { ...order, items: [...order.items, { productId, quantity: 1, options: [] }] }, order.items, now);
  gift.productId = productId;
  gift.label = productId === 'frites-maison' ? 'Une portion de frites maison offerte' : productId === 'tenders-xl-3' ? 'Trois tenders XL offerts' : `${PRODUCT_CATALOG[productId].name} offert`;
  gift.status = 'attached'; gift.stockRecorded = true; gift.resolvedAt = now.toISOString();
  return gift;
}
function state(db, now = new Date()) {
  const day = parisDateKey(now), dateEligible = inDates(day);
  const awarded = dateEligible ? ledger(db).filter(a => a.day === day).length : 0;
  const serviceOpen = ['pickup', 'delivery'].some(method => slotsForDate(day, method, db).some(slot => slot.slice(0, 5) >= CAMPAIGN.startSlot && slot.slice(0, 5) < CAMPAIGN.endSlot && scheduleOverride(db, day, slot, method) !== false));
  const status = day < CAMPAIGN.startDate ? 'scheduled' : !dateEligible || !serviceOpen || minute(now) >= CAMPAIGN.endSlot ? 'closed' : awarded >= CAMPAIGN.limit ? 'exhausted' : 'active';
  return { ...CAMPAIGN, status, day, awarded, remaining: status === 'active' ? Math.max(0, CAMPAIGN.limit - awarded) : 0,
    gifts: ['Frites maison', '3 tenders XL', 'Une boisson 33 cl'],
    rules: 'Du 3 au 9 novembre 2026, heure de Paris : un cadeau concret ajouté automatiquement à la commande des cinq premiers clients distincts par service du midi ouvert. Commande sur l’application ou le site Bibou, payée en ligne le jour même avant 14 h, pour un retrait ou une livraison entre 12 h et 14 h. Attribution au paiement confirmé, dans la limite de cinq cadeaux par jour, un par numéro de téléphone et par jour. Frites maison, trois tenders XL ou une boisson 33 cl, sélectionnés parmi les lots disponibles. En cas de rupture totale, le restaurant convient avec le client d’un cadeau de cette sélection. Aucun point ne remplace ce cadeau. Points fidélité et classement selon les règles habituelles ; tours de roue conservés. La livraison reste payante selon les conditions habituelles. Les commandes de test, offertes, sur borne et annulées avant paiement sont exclues. Un cadeau attribué n’est pas remis en jeu après annulation ou remboursement. Apple et Google ne sont ni organisateurs ni sponsors.' };
}
function news(db, now, items) {
  const offer = state(db, now);
  if (!['scheduled', 'active'].includes(offer.status)) return items;
  const subtitle = offer.status === 'scheduled' ? 'Dès le 3 novembre · 5 premiers clients du midi : frites, 3 tenders ou boisson offerts. Points fidélité et classement conservés.' :
    `${offer.remaining} cadeau${offer.remaining > 1 ? 'x' : ''} encore disponible${offer.remaining > 1 ? 's' : ''} · Commande payée aujourd’hui pour 12–14 h. Frites, 3 tenders ou boisson. Points habituels conservés.`;
  return [{ id: 'lunch-gifts', kind: 'note', enabled: true, title: 'Midi : les 5 premiers clients sont gâtés', subtitle,
    url: 'https://bibous-burger.onrender.com/cadeaux-midi', imageUrl: '' }, ...items.filter(i => i.id !== 'lunch-gifts')];
}
function page(db, now = new Date()) {
  const offer = state(db, now);
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Les cadeaux du midi · Bibou</title><style>body{margin:0;background:#fbf3e6;color:#214e3e;font:18px/1.65 system-ui,sans-serif}main{max-width:650px;margin:0 auto;padding:32px 24px}h1{line-height:1.15}a{color:inherit}.card{padding:22px;border-radius:24px;background:#e8eddf}small{font-size:15px}</style><main><p>BIBOU’S BURGERS</p><h1>Un cadeau pour les 5 premiers clients du midi 🎁</h1><div class="card"><strong>Du 3 au 9 novembre · service 12–14 h</strong><p>Une portion de frites maison, trois tenders XL ou une boisson 33 cl, ajoutés à la commande après paiement confirmé.</p><p>Ton cadeau vient en plus de tes points fidélité, de tes points de classement habituels et de tes tours de roue.</p></div><p>${offer.status === 'scheduled' ? 'L’offre commence le 3 novembre.' : offer.status === 'active' ? `${offer.remaining} cadeau${offer.remaining > 1 ? 'x' : ''} encore disponible${offer.remaining > 1 ? 's' : ''} pour ce midi. Le rang est fixé au paiement, sans réservation avant paiement.` : offer.status === 'exhausted' ? 'Les cinq cadeaux de ce midi ont déjà été attribués.' : 'Les attributions sont fermées pour le moment.'}</p><p><a href="https://bibousburgers.com/app">Ouvrir ou télécharger l’application Bibou</a></p><h2>Conditions</h2><small>${offer.rules}</small></main></html>`;
}
module.exports = { CAMPAIGN, eligible, award, resolve, state, news, page, availableGroups };
