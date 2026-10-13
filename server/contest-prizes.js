const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');
const { PRODUCT_CATALOG } = require('./catalog');
const { CONTEST_PRIZE_PLANS, CONTEST_PRIZE_RULES } = require('../contest-prize-policy');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const DAY = 86400000;
const validMonth = value => typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) && value >= '2026-01' && value <= '2099-12';
const currentMonth = now => parisDateKey(new Date(now)).slice(0, 7);
// Winners may be confirmed on the first Paris day of the prize month. A later
// confirmation must not silently consume a partial month or backdate a code.
const earliestFullMonth = now => parisDateKey(new Date(now)).endsWith('-01') ? currentMonth(now) : addMonths(currentMonth(now), 1);
function addMonths(month, count) {
  if (!validMonth(month) || !Number.isInteger(count)) fail('Mois du lot invalide.');
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + count, 1)).toISOString().slice(0, 7);
}
// Resolve civil Paris dates rather than adding 30 days or a fixed UTC offset.
function parisInstant(date, hour = 0) {
  const civil = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  let result = civil;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(result)).map(part => [part.type, part.value]));
    result += civil - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  }
  return new Date(result).toISOString();
}
function monthWindow(month) {
  const next = addMonths(month, 1), lastDay = new Date(Date.parse(`${next}-01T00:00:00Z`) - DAY).toISOString().slice(0, 10);
  const reminderDay = new Date(Date.parse(`${lastDay}T00:00:00Z`) - 10 * DAY).toISOString().slice(0, 10);
  return { startsAt: parisInstant(`${month}-01`), expiresAt: parisInstant(`${next}-01`), lastDay, reminderAt: parisInstant(reminderDay, 9), availableAlertAt: parisInstant(`${month}-01`, 9) };
}
function store(db) {
  db.contestPrizes ||= { version: 1, grants: [], vouchers: [], smsJobs: [] };
  const s = db.contestPrizes;
  if (s.version !== 1 || !['grants', 'vouchers', 'smsJobs'].every(key => Array.isArray(s[key]))) fail('Registre des lots invalide : aucune modification effectuée.', 503);
  return s;
}
const eligibleMenuIds = () => Object.keys(PRODUCT_CATALOG).filter(id => PRODUCT_CATALOG[id].menu || PRODUCT_CATALOG[id].kind === 'solo' || PRODUCT_CATALOG[id].kind === 'naan');
function finalizationPreview(db, now = new Date()) {
  const contest = db.referralContest;
  const { contestStatus, contestRanking } = require('./referral-contest');
  if (!contest || contestStatus(contest, new Date(now)) !== 'closed') fail('Les lots ne peuvent être validés qu’après la clôture du concours.', 409);
  const ranking = contestRanking(db, contest), winners = ranking.slice(0, 3);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([contest.id, contest.revision, ranking])).digest('hex');
  return { contestId: contest.id, rankingFingerprint: fingerprint, winners, tied: winners.some(winner => winner.tied),
    minimumStartMonth: earliestFullMonth(now), eligibleMenus: eligibleMenuIds().map(id => ({ id, name: PRODUCT_CATALOG[id].name })), rules: CONTEST_PRIZE_RULES };
}
function finalize(db, input, now = new Date()) {
  if (!input || input.confirmation !== 'VALIDER LES LOTS DU CONCOURS' || !/^[a-f0-9-]{36}$/i.test(input.requestId || '') ||
    Object.keys(input).some(key => !['confirmation', 'requestId', 'rankingFingerprint', 'startMonth', 'eligibleMenuIds'].includes(key))) fail('Confirmation explicite des gagnants et des conditions requise.');
  const original = db.contestPrizes?.grants || [];
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([input.rankingFingerprint, input.startMonth, input.eligibleMenuIds])).digest('hex');
  const repeated = original.filter(grant => grant.finalizationId === input.requestId);
  if (repeated.length) {
    if (repeated.some(grant => grant.finalizationFingerprint !== fingerprint)) fail('Cette confirmation correspond à d’autres conditions.', 409);
    return { changed: false, grants: repeated };
  }
  const preview = finalizationPreview(db, now);
  if (original.some(grant => grant.contestId === preview.contestId)) fail('Les lots de ce concours ont déjà été validés.', 409);
  if (preview.rankingFingerprint !== input.rankingFingerprint || preview.tied) fail('Le classement a changé ou présente un ex æquo : vérifier les résultats avant de distribuer les lots.', 409);
  if (!preview.winners.length) fail('Aucun gagnant éligible.', 409);
  const approvedLots = require('./referral-contest').defaultContest();
  if (['firstPrize', 'secondPrize', 'thirdPrize'].some(key => db.referralContest[key] !== approvedLots[key])) fail('Les lots du règlement ne correspondent pas aux quotas préparés. Vérifier les conditions avant toute attribution.', 409);
  if (!validMonth(input.startMonth) || input.startMonth < preview.minimumStartMonth) fail('Choisis un premier mois complet à venir.');
  if (!Array.isArray(input.eligibleMenuIds) || !input.eligibleMenuIds.length || new Set(input.eligibleMenuIds).size !== input.eligibleMenuIds.length ||
    input.eligibleMenuIds.some(id => !eligibleMenuIds().includes(id))) fail('Confirme la liste des menus éligibles.');
  const contest = db.referralContest;
  const grants = preview.winners.map(winner => {
    const plan = CONTEST_PRIZE_PLANS[winner.rank];
    if (!plan) fail('Rang du gagnant invalide.', 409);
    const entry = contest.entries.find(entry => entry.customerId === winner.customerId && !entry.withdrawnAt);
    return { id: crypto.randomUUID(), contestId: contest.id, contestRevision: contest.revision, customerId: winner.customerId,
      rank: winner.rank, ...plan, startMonth: input.startMonth, lastMonth: addMonths(input.startMonth, plan.months - 1),
      eligibleMenuIds: [...input.eligibleMenuIds], status: 'confirmed', alertsEnabled: entry?.prizeAlerts === true,
      confirmedAt: new Date(now).toISOString(), finalizationId: input.requestId, finalizationFingerprint: fingerprint };
  });
  store(db).grants.push(...grants);
  contest.resultsConfirmedAt = new Date(now).toISOString();
  return { changed: true, grants };
}
function allocationStatus(db, allocation) {
  const order = (db.orders || []).find(order => order.id === allocation.orderId);
  // A missing order never silently releases a benefit after a damaged restore.
  if (!order) return allocation.status === 'released' ? 'released' : 'reserved';
  if (order.status === 'cancelled') return 'released';
  return order.payment?.status === 'PAID' ? 'used' : 'reserved';
}
const remaining = (db, voucher) => Math.max(0, voucher.menus - (voucher.allocations || []).filter(a => allocationStatus(db, a) !== 'released').reduce((sum, a) => sum + a.quantity, 0));
function issueCurrentMonth(db, now = new Date(), randomCode = () => `AMB-${crypto.randomBytes(10).toString('hex').toUpperCase()}`) {
  if (!db.contestPrizes) return false;
  const s = store(db), month = currentMonth(now), liveCustomers = new Set((db.customers || []).map(c => c.id));
  let changed = false;
  for (const grant of s.grants) {
    if (grant.status !== 'confirmed' || !liveCustomers.has(grant.customerId) || month < grant.startMonth || month > grant.lastMonth || s.vouchers.some(v => v.grantId === grant.id && v.month === month)) continue;
    let code;
    for (let i = 0; i < 5; i++) {
      const candidate = randomCode();
      if (/^AMB-[A-F0-9]{20}$/.test(candidate) && !s.vouchers.some(v => v.code === candidate) && !(db.merchantPromotions || []).some(p => p.code === candidate)) { code = candidate; break; }
    }
    if (!code) fail('Impossible de créer un code personnel unique.', 503);
    s.vouchers.push({ id: crypto.randomUUID(), grantId: grant.id, customerId: grant.customerId, month, code, menus: grant.menus,
      ...monthWindow(month), createdAt: new Date(now).toISOString(), allocations: [], alerts: {} });
    changed = true;
  }
  return changed;
}
function findVoucher(db, code) { return (db.contestPrizes?.vouchers || []).find(v => v.code === code); }
function assertAvailable(db, voucher, customerId, context = {}, now = new Date()) {
  const grant = db.contestPrizes?.grants.find(g => g.id === voucher?.grantId);
  if (!voucher || !grant || grant.status !== 'confirmed' || !voucher.customerId) fail('Ce code personnel n’est plus disponible.', 409);
  if (voucher.customerId !== customerId || grant.customerId !== customerId) fail('Ce code personnel est réservé au compte gagnant.', 403);
  if (!['ios', 'android'].includes(context.appPlatform) || context.isKiosk) fail('Les menus gagnés se commandent uniquement dans l’application iPhone ou Android, pas au comptoir ni sur la borne.', 403);
  if (currentMonth(now) !== voucher.month || Date.parse(voucher.startsAt) > +new Date(now) || +new Date(now) >= Date.parse(voucher.expiresAt)) fail('Ce code est valable uniquement pendant son mois. Les menus non utilisés sont perdus, sans report.', 409);
  if (!remaining(db, voucher)) fail('Les menus disponibles avec ce code ont déjà été utilisés ou réservés dans une commande.', 409);
  return grant;
}
function promotion(db, code, now = new Date()) {
  const voucher = findVoucher(db, code);
  if (!voucher) return null;
  const grant = db.contestPrizes.grants.find(g => g.id === voucher.grantId);
  return { code, sourceContestPrize: true, voucherId: voucher.id, discountPercent: 100, freeDelivery: false,
    menuAllowance: remaining(db, voucher), singleOrder: grant?.singleOrder === true, eligibleMenuIds: grant?.eligibleMenuIds || [],
    month: voucher.month, expiresAt: voucher.expiresAt, lastDay: voucher.lastDay,
    message: 'Menus gagnés au concours · code personnel, uniquement dans l’application. Menus non utilisés perdus en fin de mois. Hors suppléments et frais de livraison.' };
}
function assertMethod(promo, method, context = {}, { preview = false } = {}) {
  if (!['ios', 'android'].includes(context.appPlatform) || context.isKiosk) fail('Ce code personnel s’utilise uniquement dans l’application iPhone ou Android.', 403);
  if (!['pickup', 'delivery'].includes(method)) fail('Choisis un retrait ou une livraison dans l’application.');
  if (preview && context.serviceDate === undefined) return;
  if (typeof context.serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(context.serviceDate) || context.serviceDate.slice(0, 7) !== promo.month || context.serviceDate > promo.lastDay)
    fail('Le créneau de commande doit être dans le mois de validité du code.');
}
function assertCart(promo, items) {
  if (!Array.isArray(items) || !items.length || items.some(item => !promo.eligibleMenuIds.includes(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1)) fail('Choisis uniquement des menus éligibles au lot pour cette commande.');
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (count > promo.menuAllowance || (promo.singleOrder && count !== promo.menuAllowance)) fail(promo.singleOrder ? 'Ce lot de deux menus doit être utilisé en une seule commande.' : `Il reste ${promo.menuAllowance} menu(s) disponible(s) pour ce mois.`, 409);
  for (const item of items) {
    const naan = PRODUCT_CATALOG[item.productId]?.kind === 'naan';
    if (naan && !item.options?.some(option => option.groupId === 'naan-format' && option.id === 'menu')) fail('Le lot concerne un menu cheese naan, pas un naan seul.');
    if (item.options?.some(option => option.price > 0 && !(naan && option.groupId === 'naan-format' && option.id === 'menu'))) fail('Les menus gagnés sont hors suppléments payants. Retire les suppléments de cette commande.');
  }
  return count;
}
function reserve(db, order, now = new Date()) {
  if (!order.promotion?.sourceContestPrize) return false;
  const voucher = findVoucher(db, order.promotion.code);
  if (!voucher) fail('Code personnel introuvable.', 409);
  voucher.allocations ||= [];
  if (voucher.allocations.some(a => a.orderId === order.id)) return false;
  const promo = promotion(db, voucher.code, now);
  assertAvailable(db, voucher, order.customerId, { appPlatform: order.contestPrizePlatform }, now);
  const quantity = assertCart(promo, order.items);
  voucher.allocations.push({ orderId: order.id, quantity, status: 'reserved', reservedAt: new Date(now).toISOString() });
  // Later replacement proposals cannot turn a one-menu gifted order into two.
  order.promotion.menuAllowance = quantity;
  return true;
}
function reconcile(db) {
  let changed = false;
  for (const voucher of db.contestPrizes?.vouchers || []) for (const allocation of voucher.allocations || []) {
    const status = allocationStatus(db, allocation);
    if (allocation.status !== status) { allocation.status = status; changed = true; }
  }
  return changed;
}
function customerState(db, customer, context = {}, now = new Date()) {
  const grants = (db.contestPrizes?.grants || []).filter(g => g.customerId === customer.id && g.status === 'confirmed');
  const native = ['ios', 'android'].includes(context.appPlatform) && !context.isKiosk;
  return { rules: CONTEST_PRIZE_RULES, appOnly: true, grants: grants.map(g => ({ id: g.id, rank: g.rank, months: g.months, menus: g.menus, startMonth: g.startMonth, lastMonth: g.lastMonth, alertsEnabled: g.alertsEnabled })),
    vouchers: (db.contestPrizes?.vouchers || []).filter(v => v.customerId === customer.id && grants.some(g => g.id === v.grantId)).map(v => {
      const grant = grants.find(g => g.id === v.grantId), left = remaining(db, v), active = currentMonth(now) === v.month && +new Date(now) < Date.parse(v.expiresAt);
      return { id: v.id, month: v.month, menus: v.menus, remaining: left, code: native && active && left ? v.code : null,
        status: !active ? 'expired' : !left ? 'used_or_reserved' : 'available', expiresAt: v.expiresAt, lastDay: v.lastDay,
        reminderAt: v.reminderAt, singleOrder: grant.singleOrder, eligibleMenus: grant.eligibleMenuIds.map(id => ({ id, name: PRODUCT_CATALOG[id].name })) };
    }).sort((a, b) => b.month.localeCompare(a.month)) };
}
function updateAlerts(db, customer, input, now = new Date()) {
  if (!input || typeof input.enabled !== 'boolean' || Object.keys(input).some(key => key !== 'enabled')) fail('Choix de rappel invalide.');
  const entry = db.referralContest?.entries.find(e => e.customerId === customer.id && !e.withdrawnAt);
  if (entry) { entry.prizeAlerts = input.enabled; entry.prizeAlertsUpdatedAt = new Date(now).toISOString(); }
  const grants = (db.contestPrizes?.grants || []).filter(g => g.customerId === customer.id);
  for (const grant of grants) { grant.alertsEnabled = input.enabled; grant.alertsUpdatedAt = new Date(now).toISOString(); }
  if (!entry && !grants.length) fail('Participe au concours pour choisir les rappels.', 409);
  if (!input.enabled) for (const job of db.contestPrizes?.smsJobs || []) if (job.customerId === customer.id && job.status === 'queued') job.status = 'cancelled';
}
function deleteCustomer(db, customerId, now = new Date()) {
  if (!db.contestPrizes) return;
  const s = store(db);
  for (const grant of s.grants) if (grant.customerId === customerId) Object.assign(grant, { customerId: null, status: 'cancelled', accountDeletedAt: new Date(now).toISOString(), alertsEnabled: false });
  for (const voucher of s.vouchers) if (voucher.customerId === customerId) { voucher.customerId = null; delete voucher.code; }
  s.smsJobs = s.smsJobs.filter(j => j.customerId !== customerId);
}
function alertEligible(db, voucherId, now = new Date()) {
  const voucher = db.contestPrizes?.vouchers.find(v => v.id === voucherId), grant = db.contestPrizes?.grants.find(g => g.id === voucher?.grantId);
  return Boolean(voucher && grant?.status === 'confirmed' && grant.alertsEnabled && grant.customerId === voucher.customerId &&
    (db.customers || []).some(c => c.id === voucher.customerId) && currentMonth(now) === voucher.month && remaining(db, voucher) > 0);
}
module.exports = { addMonths, monthWindow, currentMonth, finalizationPreview, finalize, eligibleMenuIds, issueCurrentMonth, promotion, findVoucher, assertAvailable, assertMethod, assertCart, reserve, remaining, reconcile, customerState, updateAlerts, deleteCustomer, alertEligible, store };
