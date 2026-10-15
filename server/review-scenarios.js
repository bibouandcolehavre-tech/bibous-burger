// Disposable private store-review data. No filesystem, provider or real database.
const crypto = require('node:crypto');
const contest = require('./referral-contest');
const prizes = require('./contest-prizes');
const wheel = require('./wheel');
const wheelRewardsPolicy = require('./wheel-rewards-policy');
const { availabilityCatalog, validateAndPriceOrderItems } = require('./catalog');
const { publicArticleRatings } = require('./article-ratings');
const { parisDateKey } = require('./availability');
const replacements = require('./order-replacements');

function prepareReviewScenarios(db, customer, date) {
  const today = parisDateKey(date), year = today.slice(0, 4), month = today.slice(0, 7);
  Object.assign(customer, { firstName: 'Équipe', lastName: 'de validation', verifiedPhone: customer.phone, phoneVerifiedAt: date.toISOString(), firstPhoneVerifiedAt: date.toISOString(), createdAt: date.toISOString() });
  db.referralContest = { ...contest.defaultContest(), id: 'isolated-review-contest', status: 'published', revision: 1, startDate: `${year}-01-01`, endDate: `${year}-12-31`, rules: 'Démonstration réservée aux vérificateurs : concours, points et lots fictifs, sans envoi au restaurant ni gain utilisable. Aucun achat ou SMS réel. Les règles client restent distinctes et le concours public n’est pas activé.' };
  db.wheel = { ...wheel.defaultWheel(), startDate: `${year}-01-01`, endDate: `${year}-12-31`, officialRules: 'Démonstration privée de la roue : aucun gain réel. ' + wheel.defaultWheel().officialRules };
  wheelRewardsPolicy.activate(db, { rewardsVersion: 2, monthlyClassicEnabled: true, confirmation: 'ACTIVER LA ROUE 80' }, date);
  db.wheel.officialRules = 'Démonstration privée : aucun gain réel. ' + db.wheel.officialRules;
  db.contestPrizes = { version: 1, smsJobs: [], vouchers: [], grants: [{ id: `review-grant-${customer.id}`, customerId: customer.id, contestId: 'isolated-previous-contest', rank: 1, menus: 2, months: 12, startMonth: month, lastMonth: prizes.addMonths(month, 11), eligibleMenuIds: ['classique-menu', 'montagnes-menu'], status: 'confirmed', alertsEnabled: false, singleOrder: false }] };
  prizes.issueCurrentMonth(db, date);
  // A separate fictional order lets reviewers try a missing drink immediately.
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const cart = validateAndPriceOrderItems([{ productId: 'drink-coca', quantity: 1, selections: [] }]);
  const order = { id: 'review-replacement-example', number: 'TEST-RUPTURE', customerId: customer.id, customerName: customer.name, ...cart, discount: 0, discountRate: 0, deliveryFee: 0, total: cart.subtotal, paidTotal: cart.subtotal, method: 'pickup', serviceDate: tomorrow, slot: '19:00', createdAt: date.toISOString(), status: 'confirmed', reviewMode: true, payment: { status: 'PAID', provider: 'isolated-review-simulation', paidAt: date.toISOString() } };
  replacements.requestReplacement(order, { revision: 0, targets: ['0:product'], reason: 'Exemple fictif : Coca indisponible, choisis une autre boisson.' }, +date);
  db.orders.push(order);
  return { contestSecret: crypto.randomBytes(32).toString('hex') };
}
function reviewContestState(db, customer, date) {
  const data = contest.customerContest(db, customer, date);
  if (data.participation) data.participation.shareUrl = 'https://example.invalid/bibou-review-only';
  return { ...data, reviewMode: true };
}
function reviewCatalog(db, date) {
  const result = availabilityCatalog({}, date, db);
  const ratings = publicArticleRatings({ ...db, orders: db.orders.map(order => ({ ...order, reviewMode: false })) });
  result.products = result.products.map(product => ({ ...product, satisfaction: ratings[product.id.replace(/-menu$/, '')] || null,
    ...(product.category === 'naans' ? { visible: true, available: true, published: false, inServiceWindow: true, availabilityState: 'available', reason: 'Aperçu privé : commande fictive uniquement, avec un créneau du midi.' } : {}) }));
  return { ...result, reviewMode: true, demoService: 'lunch', publicPublicationChanged: false };
}
module.exports = { prepareReviewScenarios, reviewContestState, reviewCatalog };
