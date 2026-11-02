// Transitional paper-card rights. No loyalty points, purchases or payments are created here.
const crypto = require('node:crypto');
const { ensureRewardStore } = require('./rewards');
const TARGET = 10;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const records = db => Array.isArray(db.paperLoyaltyTransfers) ? db.paperLoyaltyTransfers : [];
const claims = (db, customer) => (db.rewardClaims || []).filter(c => c.customerId === customer.id && c.source === 'paper-card');
const dayKey = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
function customerState(db, customer) {
  if (!customer.paperLoyalty) return null;
  const state = customer.paperLoyalty;
  return { stamps: state.stamps, target: TARGET, remaining: state.stamps ? TARGET - state.stamps : 0,
    transferredStamps: state.transferredStamps, importedCards: state.importedCards, completedCards: state.completedCards,
    rewards: claims(db, customer).map(c => ({ id: c.id, code: c.code, title: c.rewardTitle, status: c.status, createdAt: c.createdAt, usedAt: c.usedAt || null })),
    updatedAt: state.updatedAt };
}
function walletState(db, customer) {
  const state = customerState(db, customer);
  return state && { stamps: state.stamps, target: TARGET, availableBurgers: state.rewards.filter(c => c.status === 'active').length };
}
function staffState(db, customer) {
  return { paperCard: customerState(db, customer), history: records(db).filter(r => r.customerId === customer.id).slice().reverse().slice(0, 50).map(r => ({
    id: r.id, kind: r.kind, reference: r.reference, ticketDate: r.ticketDate || null, stamps: r.stamps, createdAt: r.createdAt,
    cancelledAt: r.cancelledAt || null, cancelReason: r.cancelReason || null, rewardIds: r.rewardIds,
    cancellable: !r.cancelledAt && isLatest(db, customer, r) && r.rewardIds.every(id => (db.rewardClaims || []).find(c => c.id === id)?.status === 'active')
  })) };
}
function isLatest(db, customer, record) { return records(db).filter(r => r.customerId === customer.id && !r.cancelledAt).at(-1)?.id === record.id; }
function requireVerified(customer) {
  if (!customer?.phoneVerifiedAt) throw fail('Le client doit d’abord vérifier son numéro pour reprendre sa carte.', 409);
}
function inputFor(input, kind, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId || '')) throw fail('Référence de reprise invalide. Rouvrez la fiche puis réessayez.');
  if (!Number.isInteger(input.stamps) || input.stamps < 1 || input.stamps > TARGET) throw fail('Indiquez un nombre entier de 1 à 10 tampons.');
  const reference = String(kind === 'transfer' ? input.cardReference || '' : input.ticketReference || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 ./_-]{2,63}$/.test(reference)) throw fail(kind === 'transfer' ? 'Indiquez le repère de cette carte papier.' : 'Indiquez la référence du ticket de l’achat vérifié.');
  const ticketDate = kind === 'stamp' ? String(input.ticketDate || '') : null;
  if (kind === 'stamp' && (!/^\d{4}-\d{2}-\d{2}$/.test(ticketDate) || !Number.isFinite(Date.parse(ticketDate)) || new Date(ticketDate).toISOString().slice(0, 10) !== ticketDate || ticketDate > dayKey(now))) throw fail('La date du ticket doit être valide et ne pas être dans le futur.');
  return { requestId: input.requestId.toLowerCase(), stamps: input.stamps, reference, ticketDate };
}
function grantBurger(db, customer, now) {
  ensureRewardStore(db);
  let code; do { code = 'BIBOU-P-' + crypto.randomBytes(4).toString('hex').toUpperCase(); } while (db.rewardClaims.some(c => c.code === code));
  const number = db.nextRewardClaimNumber++;
  const claim = { id: `reward-claim-${number}`, number, code, customerId: customer.id, customerName: customer.name || 'Client Bibou',
    source: 'paper-card', rewardId: `paper-burger-${crypto.randomUUID()}`, rewardTitle: 'Un burger offert — ancienne carte papier', requiredPoints: 0,
    status: 'active', createdAt: now.toISOString() };
  db.rewardClaims.unshift(claim); return claim.id;
}
function credit(db, customer, input, kind, now = new Date()) {
  if (!['transfer', 'stamp'].includes(kind)) throw fail('Type de saisie invalide.');
  requireVerified(customer);
  const value = inputFor(input, kind, now);
  const canonical = JSON.stringify([customer.id, kind, value.stamps, value.reference, value.ticketDate]);
  const previous = records(db).find(r => r.requestId === value.requestId);
  if (previous) {
    if (previous.canonical !== canonical) throw fail('Cette demande a déjà servi à une autre saisie. Rouvrez le formulaire.', 409);
    return { ...staffState(db, customer), operation: { id: previous.id, cancelled: Boolean(previous.cancelledAt) }, replayed: true };
  }
  if (records(db).some(r => !r.cancelledAt && r.kind === kind && r.reference === value.reference && (kind === 'transfer' || r.ticketDate === value.ticketDate)))
    throw fail(kind === 'transfer' ? 'Cette carte a déjà été reprise. Consultez son historique.' : 'Ce ticket a déjà servi à ajouter des tampons.', 409);
  if (kind === 'stamp' && (!customer.paperLoyalty?.stamps || value.stamps > TARGET - customer.paperLoyalty.stamps)) throw fail('Ajoutez uniquement les tampons restant à compléter sur une ancienne carte en cours.', 409);
  const before = customer.paperLoyalty ? structuredClone(customer.paperLoyalty) : null;
  const state = customer.paperLoyalty ||= { stamps: 0, transferredStamps: 0, importedCards: 0, completedCards: 0 };
  const total = state.stamps + value.stamps, completed = Math.floor(total / TARGET);
  state.stamps = total % TARGET;
  if (kind === 'transfer') { state.transferredStamps += value.stamps; state.importedCards++; }
  state.completedCards += completed; state.updatedAt = now.toISOString();
  const rewardIds = Array.from({ length: completed }, () => grantBurger(db, customer, now));
  const record = { id: crypto.randomUUID(), customerId: customer.id, kind, ...value, canonical, before, rewardIds, createdAt: now.toISOString() };
  (db.paperLoyaltyTransfers ||= []).push(record);
  return { ...staffState(db, customer), operation: { id: record.id, cancelled: false }, replayed: false };
}
function cancel(db, customer, id, input = {}, now = new Date()) {
  const record = records(db).find(r => r.id === id && r.customerId === customer.id);
  if (!record) throw fail('Reprise introuvable.', 404);
  if (record.cancelledAt) return { ...staffState(db, customer), replayed: true };
  if (!isLatest(db, customer, record) || !record.rewardIds.every(id => (db.rewardClaims || []).find(c => c.id === id)?.status === 'active'))
    throw fail('Cette saisie ne peut plus être annulée : une opération a suivi ou le cadeau a déjà été traité.', 409);
  if (!input || !['Erreur de saisie', 'Mauvais compte', 'Mauvais nombre de tampons'].includes(input.reason)) throw fail('Choisissez le motif de correction.');
  for (const id of record.rewardIds) { const claim = db.rewardClaims.find(c => c.id === id); claim.status = 'cancelled'; claim.cancelledAt = claim.updatedAt = now.toISOString(); }
  if (record.before) customer.paperLoyalty = structuredClone(record.before); else delete customer.paperLoyalty;
  record.cancelledAt = now.toISOString(); record.cancelReason = input.reason;
  return { ...staffState(db, customer), replayed: false };
}
function removeCustomer(db, customerId) { if (Array.isArray(db.paperLoyaltyTransfers)) db.paperLoyaltyTransfers = db.paperLoyaltyTransfers.filter(r => r.customerId !== customerId); }
module.exports = { TARGET, customerState, walletState, staffState, credit, cancel, removeCustomer };
