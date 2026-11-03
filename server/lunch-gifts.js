'use strict';
const crypto = require('node:crypto');
const { parisDateKey, slotsForDate, scheduleOverride, serviceSlotInstant } = require('./availability');
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
function eligibleBasket(order, customer, now) {
  if (!order || !customer || order.status !== 'awaiting_payment' || order.lunchGift ||
      order.reviewMode || order.isTest || order.isReview || customer.reviewMode || customer.isKioskGuest ||
      order.kioskGuest || order.kioskImmediate || order.kioskSessionId || order.kioskDeviceDigest ||
      order.source === 'uber' || order.externalSource || order.promotion?.sourceContestPrize ||
      !['pickup', 'delivery'].includes(order.method) ||
      !Array.isArray(order.items) || !order.items.length ||
      !(Number(order.subtotal) - Number(order.discount || 0) > 0) || !(Number(order.total) > 0) || order.refund) return false;
  const created = new Date(order.createdAt);
  if (!Number.isFinite(+created) || +created > +now) return false;
  const day = parisDateKey(now), slot = String(order.slot || '').slice(0, 5);
  return inDates(day) && order.serviceDate === day && parisDateKey(created) === day &&
    /^\d{2}:\d{2}$/.test(slot) && slot >= CAMPAIGN.startSlot && slot < CAMPAIGN.endSlot && minute(now) < CAMPAIGN.endSlot;
}

function eligible(order, customer, now = new Date()) {
  if (order?.payment?.status !== 'PAID' || order.payment.provider !== 'sumup' || !eligibleBasket(order, customer, now)) return false;
  const paid = new Date(order.payment.paidAt);
  return Number.isFinite(+paid) && +paid <= +now && +paid >= Date.parse(order.createdAt) && parisDateKey(paid) === order.serviceDate;
}

const discountHoldMs = 5 * 60 * 1000;
const dailyAwards = (db, day) => ledger(db).filter(award => award.day === day);
const discountDraw = (db, day) => db.lunchGiftCampaigns?.[CAMPAIGN.id]?.discountDraws?.[day];

function campaignStore(db) {
  db.lunchGiftCampaigns ||= {};
  return db.lunchGiftCampaigns[CAMPAIGN.id] ||= { awards: [] };
}

function discountReserved(order, day, now) {
  if (order.lunchDiscount?.day !== day) return false;
  // Once a provider request exists, an apparent timeout cannot release the prize.
  if (order.payment?.checkoutReference || order.payment?.status === 'PAID') return true;
  return order.status === 'awaiting_payment' && Date.parse(order.lunchDiscount.expiresAt) > +now;
}

function applyLunchDiscount(pricing) {
  const netCents = Math.round(pricing.subtotal * 100) - Math.round(pricing.discount * 100);
  const amountCents = Math.min(500, Math.round(netCents * 0.20));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { pricing, amountCents: 0 };
  return {
    amountCents,
    pricing: {
      ...pricing,
      discount: (Math.round(pricing.discount * 100) + amountCents) / 100,
      total: (Math.round(pricing.total * 100) - amountCents) / 100,
    },
  };
}

function discountEnabled(day, startDate) {
  return inDates(day) && /^\d{4}-\d{2}-\d{2}$/.test(startDate || '') && day >= startDate;
}

function ensureDiscountDraw(db, day, previous, startDate, randomInt) {
  const draw = discountDraw(db, day);
  if (draw || previous.length || !discountEnabled(day, startDate)) return draw;
  const campaign = campaignStore(db);
  campaign.discountDraws ||= {};
  return campaign.discountDraws[day] = { afterPhysicalAwards: randomInt(CAMPAIGN.limit) };
}

function reserveDiscount(db, order, customer, pricing, { now = new Date(), secret, startDate, randomInt = crypto.randomInt } = {}) {
  const day = parisDateKey(now);
  if (!discountEnabled(day, startDate) || !eligibleBasket(order, customer, now)) return pricing;
  const key = identity(customer, secret);
  if (!key) return pricing;
  const previous = dailyAwards(db, day);
  if (previous.some(a => a.identityDigest === key || a.kind === 'discount')) return pricing;
  const draw = ensureDiscountDraw(db, day, previous, startDate, randomInt);
  if (!draw || previous.length < draw.afterPhysicalAwards || db.orders.some(o => discountReserved(o, day, now))) return pricing;
  const discounted = applyLunchDiscount(pricing);
  if (!discounted.amountCents) return pricing;
  order.lunchDiscount = { day, amountCents: discounted.amountCents, expiresAt: new Date(Math.min(+now + discountHoldMs, +serviceSlotInstant(day, CAMPAIGN.endSlot))).toISOString() };
  return discounted.pricing;
}

function recordPaidDiscount(db, order, customer, secret, now = new Date()) {
  const day = order.lunchDiscount?.day;
  if (!day || order.payment?.status !== 'PAID' || order.payment.provider !== 'sumup') return;
  const previous = dailyAwards(db, day);
  if (previous.some(a => a.kind === 'discount')) return;
  campaignStore(db).awards.push({
    day, rank: previous.length + 1, orderId: order.id, identityDigest: identity({ phone: order.customerPhone || customer?.phone }, secret),
    kind: 'discount', awardedAt: order.payment.paidAt || now.toISOString(),
  });
}

function availableGroups(db, flags = {}) {
  if (flags === null) return [];
  return groups.map(ids => ids.filter(id => flags[id] !== false && stock.available(db, id) !== 0)).filter(ids => ids.length);
}
function award(db, order, customer, { now = new Date(), flags = {}, secret, startDate = process.env.LUNCH_DISCOUNT_START_DATE, randomInt = crypto.randomInt } = {}) {
  if (order.lunchGift?.campaignId === CAMPAIGN.id) return order.lunchGift;
  if (order.lunchDiscount || !eligible(order, customer, now)) return null;
  const key = identity(customer, secret), day = order.serviceDate;
  if (!key) return null;
  const previous = ledger(db).filter(a => a.day === day);
  const mixed = ensureDiscountDraw(db, day, previous, startDate, randomInt);
  const physicalCount = previous.filter(a => a.kind !== 'discount').length;
  if (previous.length >= CAMPAIGN.limit || (mixed && physicalCount >= CAMPAIGN.limit - 1) ||
      previous.some(a => a.identityDigest === key || a.orderId === order.id) ||
      (mixed && db.orders.some(o => discountReserved(o, day, now) && identity({ phone: o.customerPhone }, secret) === key))) return null;
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
  const awarded = dateEligible ? dailyAwards(db, day).length : 0;
  const mixed = Boolean(discountDraw(db, day) || (!awarded && discountEnabled(day, process.env.LUNCH_DISCOUNT_START_DATE)));
  const mixedRules = 'Une remise surprise par midi au maximum : 20 % sur les produits après les autres remises, plafonnée à 5 €. Elle est proposée au hasard lors de la commande en ligne sur un parcours compatible, puis réservée jusqu’à cinq minutes avant l’ouverture de SumUp. Quatre cadeaux physiques au maximum sont attribués au paiement confirmé. Un seul avantage par numéro et par jour. Si le nombre de commandes est insuffisant, la remise peut ne pas être attribuée. Retrait ou livraison pour le service de 12 h à 14 h, paiement en ligne le jour même. Les frais de livraison, la fidélité et le classement suivent les conditions habituelles.';
  const serviceOpen = ['pickup', 'delivery'].some(method => slotsForDate(day, method, db).some(slot => slot.slice(0, 5) >= CAMPAIGN.startSlot && slot.slice(0, 5) < CAMPAIGN.endSlot && scheduleOverride(db, day, slot, method) !== false));
  const status = day < CAMPAIGN.startDate ? 'scheduled' : !dateEligible || !serviceOpen || minute(now) >= CAMPAIGN.endSlot ? 'closed' : awarded >= CAMPAIGN.limit ? 'exhausted' : 'active';
  return { ...CAMPAIGN, status, day, awarded, mixed, remaining: status === 'active' ? Math.max(0, CAMPAIGN.limit - awarded) : 0,
    gifts: ['Frites maison', '3 tenders XL', 'Une boisson 33 cl'],
    rules: mixed ? mixedRules : 'Du 3 au 9 novembre 2026, heure de Paris : un cadeau concret ajouté automatiquement à la commande des cinq premiers clients distincts par service du midi ouvert. Commande sur l’application ou le site Bibou, payée en ligne le jour même avant 14 h, pour un retrait ou une livraison entre 12 h et 14 h. Attribution au paiement confirmé, dans la limite de cinq cadeaux par jour, un par numéro de téléphone et par jour. Frites maison, trois tenders XL ou une boisson 33 cl, sélectionnés parmi les lots disponibles. En cas de rupture totale, le restaurant convient avec le client d’un cadeau de cette sélection. Aucun point ne remplace ce cadeau. Points fidélité et classement selon les règles habituelles ; tours de roue conservés. La livraison reste payante selon les conditions habituelles. Les commandes de test, offertes, sur borne et annulées avant paiement sont exclues. Un cadeau attribué n’est pas remis en jeu après annulation ou remboursement. Apple et Google ne sont ni organisateurs ni sponsors.' };
}
function news(db, now, items) {
  const offer = state(db, now);
  if (!['scheduled', 'active'].includes(offer.status)) return items;
  const subtitle = offer.mixed ? 'Jusqu’à 5 avantages ce midi : 4 cadeaux et une remise surprise de 20 % sur les produits, plafonnée à 5 €.' : offer.status === 'scheduled' ? 'Dès le 3 novembre · 5 premiers clients du midi : frites, 3 tenders ou boisson offerts. Points fidélité et classement conservés.' :
    `${offer.remaining} cadeau${offer.remaining > 1 ? 'x' : ''} encore disponible${offer.remaining > 1 ? 's' : ''} · Commande payée aujourd’hui pour 12–14 h. Frites, 3 tenders ou boisson. Points habituels conservés.`;
  return [{ id: 'lunch-gifts', kind: 'note', enabled: true, title: 'Midi : les 5 premiers clients sont gâtés', subtitle,
    url: 'https://bibous-burger.onrender.com/cadeaux-midi', imageUrl: '' }, ...items.filter(i => i.id !== 'lunch-gifts')];
}
function page(db, now = new Date()) {
  const offer = state(db, now);
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Les cadeaux du midi · Bibou</title><style>body{margin:0;background:#fbf3e6;color:#214e3e;font:18px/1.65 system-ui,sans-serif}main{max-width:650px;margin:0 auto;padding:32px 24px}h1{line-height:1.15}a{color:inherit}.card{padding:22px;border-radius:24px;background:#e8eddf}small{font-size:15px}</style><main><p>BIBOU’S BURGERS</p><h1>Un cadeau pour les 5 premiers clients du midi 🎁</h1><div class="card"><strong>Du 3 au 9 novembre · service 12–14 h</strong><p>${offer.mixed ? 'Quatre cadeaux physiques et une remise surprise de 20 % sur les produits, plafonnée à 5 €. La remise est affichée avant de payer.' : 'Une portion de frites maison, trois tenders XL ou une boisson 33 cl, ajoutés à la commande après paiement confirmé.'}</p><p>Ton cadeau vient en plus de tes points fidélité, de tes points de classement habituels et de tes tours de roue.</p></div><p>${offer.status === 'scheduled' ? 'L’offre commence le 3 novembre.' : offer.status === 'active' ? `${offer.remaining} cadeau${offer.remaining > 1 ? 'x' : ''} encore disponible${offer.remaining > 1 ? 's' : ''} pour ce midi.${offer.mixed ? '' : ' Le rang est fixé au paiement, sans réservation avant paiement.'}` : offer.status === 'exhausted' ? 'Les cinq cadeaux de ce midi ont déjà été attribués.' : 'Les attributions sont fermées pour le moment.'}</p><p><a href="https://bibousburgers.com/app">Ouvrir ou télécharger l’application Bibou</a></p><h2>Conditions</h2><small>${offer.rules}</small></main></html>`;
}
module.exports = { applyLunchDiscount, reserveDiscount, recordPaidDiscount, CAMPAIGN, eligible, award, resolve, state, news, page, availableGroups };
