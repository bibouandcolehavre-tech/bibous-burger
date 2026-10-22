'use strict';
// A separate invoice series for orders originating in the customer application.
// No payment, order transition, loyalty update or SMS is triggered by this module.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createDatabaseLock } = require('./database-lock');
const { PRODUCT_CATALOG } = require('./catalog');
const fail = (message, statusCode = 409, code = 'INVOICE_VALIDATION_REQUIRED') => {
  throw Object.assign(new Error(message), { statusCode, code });
};
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const clean = (v, limit = 180) => String(v || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, limit);
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const cents = v => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000000) fail('Montant de commande à vérifier.');
  const n = Math.round(v * 100);
  if (Math.abs(v * 100 - n) > 0.00001) fail('Montant de commande à vérifier.');
  return n;
};
const parisDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const MENU_IDS = new Set(['taurus', 'montagnes-menu', 'atlas-menu', 'classique-menu', 'duck-menu', 'dynamite-menu', 'gros-lard-menu', 'hambagu-menu', 'basilic-menu', 'pork-menu', 'menu-solo-tenders', 'menu-duo-tenders']);
const FOOD_IDS = new Set(['atlas', 'classique', 'duck', 'dynamite', 'hambagu', 'basilic', 'montagnes', 'gros-lard', 'pork', 'custom-burger', 'frites-maison', 'frites-cheddar', 'frites-cheddar-bacon', 'tenders-xl-3']);
const DRINK_IDS = new Set(Object.keys(PRODUCT_CATALOG).filter(id => id.startsWith('drink-')));
const RATES = new Set([550, 1000, 2000]); // basis points, never floating point percentages
const originalNumber = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 /._-]{0,69}$/.test(value);
const filenameFor = record => record.snapshot.source === 'laddition'
  ? `facture-commande-${String(record.orderId).slice(6)}-laddition.pdf`
  : record.snapshot.number + '.pdf';

function rateFor(item, order, settings) {
  const id = item.productId;
  if (typeof id !== 'string' || !PRODUCT_CATALOG[id]) fail('Un article historique doit être vérifié par le restaurant.');
  const options = item.options || [];
  if (!Array.isArray(options)) fail('Options historiques à vérifier.');
  // Do not infer alcohol tax from a name or absorb an unknown new option at 10%.
  if (options.some(o => !object(o) || /bi[eè]re|alcool|\bbeer\b|\bwine\b/i.test(String(o.label || o.name || o.id || ''))))
    fail('La TVA de cette option doit être validée par le restaurant.');
  const softChoices = new Set(['coca', 'coca-cherry', 'coca-zero', 'coca-vanille', 'fanta-orange', 'fanta', 'fuse-menthe', 'lipton-framboise', 'lipton-peche', 'oasis-pomme', 'oasis-tropical', 'perrier', 'tropico', 'tropico-exotique', 'cristaline']);
  if (options.some(o => ['drink', 'duo-drink-one', 'duo-drink-two'].includes(o.groupId) && !softChoices.has(o.id)))
    fail('Une nouvelle boisson du menu doit être vérifiée avant facturation.');
  if (MENU_IDS.has(id)) return 1000; // owner-confirmed whole-menu, highest-rate method, no alcohol
  if (FOOD_IDS.has(id) || id.startsWith('naan-')) {
    if (options.some(o => ['desserts', 'menu-desserts', 'solo-dessert', 'duo-dessert-one', 'duo-dessert-two', 'drink'].includes(o.groupId))
      && !id.startsWith('naan-')) fail('Les suppléments hors menu doivent être ventilés par le restaurant.');
    return 1000;
  }
  if (DRINK_IDS.has(id)) return order.dineIn ? 1000 : 550;
  const rate = settings?.productRates?.[id]?.[order.dineIn ? 'dineIn' : 'takeaway'];
  if (!RATES.has(rate)) fail('Le restaurant doit confirmer la TVA de ce dessert avant émission.');
  return rate;
}

// Largest remainder allocation: discounts and transport never lose/gain a cent.
function allocate(total, weights) {
  if (!Number.isSafeInteger(total) || total < 0 || !weights.length || weights.some(v => !Number.isSafeInteger(v) || v < 0)) fail('Répartition invalide.');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) { if (total) fail('Répartition impossible.'); return weights.map(() => 0); }
  const rows = weights.map((w, index) => ({ index, value: Math.floor(total * w / sum), remainder: total * w % sum }));
  let remaining = total - rows.reduce((a, b) => a + b.value, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) if (remaining-- > 0) row.value++;
  return rows.map(row => row.value);
}

function prepare(order, customer, settings, now = new Date(), billing) {
  if (!order || order.payment?.status !== 'PAID' || order.isTest || order.isReview || order.kioskGuest || order.source === 'uber' || order.externalSource)
    fail('Une commande Bibou réglée est nécessaire.');
  if (['cancelled', 'awaiting_payment', 'awaiting_customer'].includes(order.status) || order.refund || order.amendment || order.amendmentHistory?.length)
    fail('Commande modifiée ou remboursée : une vérification comptable est nécessaire.');
  if (order.promotion) fail('La répartition de cette promotion doit être vérifiée avant facturation.');
  if (!customer || !order.customerId || order.customerId !== customer.id) fail('Compte de facturation introuvable.', 404);
  if (!Array.isArray(order.items) || !order.items.length || order.items.length > 100) fail('Articles de commande à vérifier.');
  if (billing !== undefined && (!object(billing) || Object.keys(billing).some(k => !['name', 'address', 'omitAddress'].includes(k))
    || typeof billing.name !== 'string' || billing.name.trim().length < 2 || billing.name.length > 180
    || typeof billing.address !== 'string' || billing.address.length > 240 || typeof billing.omitAddress !== 'boolean')) fail('Coordonnées de facturation invalides.', 400);
  const customerName = clean(billing?.name || order.customerName || customer.name);
  if (!customerName || customerName === 'Client supprimé') fail('Identité de facturation à vérifier.');
  const totalCents = cents(order.paidTotal ?? order.total), subtotalCents = cents(order.subtotal), deliveryCents = cents(order.deliveryFee ?? 0);
  if (order.paidTotal !== undefined && cents(order.total) !== totalCents) fail('Le montant réglé diffère de la commande actuelle.');
  const items = order.items.map(item => {
    if (!object(item) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) fail('Quantité à vérifier.');
    const unitCents = cents(item.unitPrice ?? item.price);
    const grossCents = unitCents * item.quantity;
    if (item.total !== undefined && cents(item.total) !== grossCents) fail('Total de ligne incohérent.');
    return { productId: item.productId, name: clean(item.name || PRODUCT_CATALOG[item.productId]?.name), quantity: item.quantity,
      unitCents, grossCents, rate: rateFor(item, order, settings),
      detail: clean((item.options || []).filter(o => ['drink', 'duo-drink-one', 'duo-drink-two', 'naan-dessert', 'menu-desserts', 'solo-dessert', 'duo-dessert-one', 'duo-dessert-two'].includes(o.groupId)).map(o => o.label || o.name).filter(Boolean).join(', '), 220) };
  });
  if (items.reduce((a, b) => a + b.grossCents, 0) !== subtotalCents) fail('Sous-total historique incohérent.');
  const discountCents = cents(order.discount ?? 0);
  if (discountCents > subtotalCents || subtotalCents - discountCents + deliveryCents !== totalCents) fail('La remise et le règlement doivent être rapprochés.');
  const discounts = allocate(discountCents, items.map(i => i.grossCents));
  items.forEach((item, i) => { item.discountCents = discounts[i]; item.ttcCents = item.grossCents - discounts[i]; });
  const byRate = new Map();
  for (const item of items) byRate.set(item.rate, (byRate.get(item.rate) || 0) + item.ttcCents);
  const rates = [...byRate.keys()].sort((a, b) => a - b);
  const transport = allocate(deliveryCents, rates.map(rate => byRate.get(rate)));
  const tax = rates.map((rate, i) => {
    const ttcCents = byRate.get(rate) + transport[i], htCents = Math.round(ttcCents * 10000 / (10000 + rate));
    return { rate, ttcCents, htCents, vatCents: ttcCents - htCents, deliveryCents: transport[i] };
  });
  if (totalCents > 0 && !tax.length) fail('Ventilation de TVA indisponible.');
  const serviceDate = order.serviceDate || (order.payment.paidAt && parisDay(order.payment.paidAt));
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(serviceDate || '') && new Date(serviceDate + 'T12:00:00Z');
  if (!validDay || !Number.isFinite(+validDay) || validDay.toISOString().slice(0, 10) !== serviceDate || serviceDate > parisDay(now)) fail('Facture disponible après la date du service.');
  const address = order.deliveryAddress || {};
  const customerAddress = billing ? (billing.omitAddress ? '' : clean(billing.address, 240)) : clean([address.address, address.postalCode, address.city].filter(Boolean).join(', '));
  if (!customerAddress && billing?.omitAddress !== true) fail('Renseigne ton adresse de facturation ou indique que tu ne souhaites pas la faire figurer.');
  return { version: 1, orderId: order.id, orderNumber: order.number, customerId: customer.id, customerName,
    customerAddress, customerAddressOmittedAtRequest: billing?.omitAddress === true, accountingPolicy: 'same-sale-already-paid',
    serviceDate, issuedAt: new Date(now).toISOString(), method: order.dineIn ? 'Sur place' : order.method === 'delivery' ? 'Livraison' : 'Click & collect',
    items, subtotalCents, discountCents, discountLabel: clean(order.discountLabel || (order.welcomeRewardApplied ? 'Remise de bienvenue' : 'Remise')),
    deliveryCents, totalCents, htCents: tax.reduce((a, b) => a + b.htCents, 0), vatCents: tax.reduce((a, b) => a + b.vatCents, 0), tax,
    paymentMethod: order.payment.provider === 'cash' ? 'Espèces' : 'Carte bancaire', paidAt: order.payment.paidAt || null };
}

function validateSettings(input) {
  if (!object(input) || input.confirm !== 'ACTIVER LES FACTURES WEB' || input.sameSaleReconciliation !== true || input.menuPolicy !== 'whole-menu-10')
    fail('Confirmez le rapprochement avec les ventes déjà payées, sans seconde comptabilisation.', 400);
  const seller = input.seller;
  if (!object(seller) || !clean(seller.name) || !clean(seller.address) || !/^\d{14}$/.test(seller.siret || '')
    || !/^FR[A-Z0-9]{2}\d{9}$/.test(seller.vatNumber || '') || !clean(seller.legalForm) || !clean(seller.rcs)
    || !Number.isSafeInteger(seller.capitalCents) || seller.capitalCents < 0) fail('Coordonnées fiscales du vendeur incomplètes.', 400);
  const productRates = input.productRates || {};
  if (!object(productRates) || Object.keys(productRates).length > 100) fail('Taux produits invalides.', 400);
  for (const [id, rates] of Object.entries(productRates)) {
    if (!id.startsWith('dessert-') || !PRODUCT_CATALOG[id] || !object(rates) || !RATES.has(rates.takeaway) || rates.dineIn !== 1000)
      fail('Validation des desserts requise.', 400);
  }
  return { seller: { name: clean(seller.name), tradeName: clean(seller.tradeName), address: clean(seller.address), siret: seller.siret,
    vatNumber: seller.vatNumber, legalForm: clean(seller.legalForm), rcs: clean(seller.rcs), capitalCents: seller.capitalCents },
    menuPolicy: 'whole-menu-10', sameSaleReconciliation: true, prefix: 'WEB', productRates: structuredClone(productRates) };
}

function createInvoiceStore(file, { now = () => new Date(), render = snapshot => require('./pdf/customer-invoice').renderInvoice(snapshot) } = {}) {
  const acquire = createDatabaseLock();
  async function read() {
    try {
      const state = JSON.parse(await fs.readFile(file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.records) || !object(state.nextByYear) || !Array.isArray(state.requests)) throw Error('Invalid invoice ledger');
      const numbers = new Set(), ids = new Set();
      for (const record of state.records) {
        const validNumber = record.snapshot?.source === 'laddition' ? originalNumber(record.snapshot.number) : /^WEB-\d{4}-\d{6}$/.test(record.snapshot?.number || '');
        if (!validNumber || numbers.has(record.snapshot.number) || !/^order-\d+$/.test(record.orderId || '') || ids.has(record.orderId)
          || record.orderId !== record.snapshot.orderId || record.customerId !== record.snapshot.customerId || !Array.isArray(record.links)
          || sha(JSON.stringify(record.snapshot)) !== record.snapshotSha256
          || !/^[a-f0-9]{64}$/.test(record.pdfSha256) || sha(Buffer.from(record.pdfBase64 || '', 'base64')) !== record.pdfSha256) throw Error('Invalid invoice record');
        numbers.add(record.snapshot.number); ids.add(record.orderId);
      }
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, settings: null, records: [], requests: [], nextByYear: {}, sms: [] };
      fail('Le registre de factures doit être vérifié. Aucun nouveau numéro attribué.', 503);
    }
  }
  async function write(state) {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      const handle = await fs.open(tmp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(tmp, file);
    } finally { await fs.unlink(tmp).catch(() => {}); }
  }
  const transact = async fn => { const release = await acquire(); try { return await fn(await read()); } finally { release(); } };
  const recordView = record => ({ status: 'issued', number: record.snapshot.number, filename: filenameFor(record), source: record.snapshot.source || 'application', issuedAt: record.snapshot.issuedAt, totalCents: record.snapshot.totalCents });
  const find = (state, orderId) => state.records.find(record => record.orderId === orderId);
  return {
    read,
    async configure(input) { return transact(async state => {
      const settings = validateSettings(input);
      if (state.settings && JSON.stringify(state.settings.seller) !== JSON.stringify(settings.seller) && state.records.length)
        fail('L’identité de l’émetteur ne peut pas être remplacée après une émission.');
      state.settings = settings; await write(state); return { configured: true, prefix: settings.prefix, productRates: settings.productRates };
    }); },
    async status(order, customer) {
      const state = await read(), record = find(state, order.id);
      if (record) { if (record.customerId !== customer?.id) fail('Facture introuvable.', 404); return recordView(record); }
      const address = order.deliveryAddress || {}, billing = { name: clean(order.customerName || customer?.name), address: clean([address.address, address.postalCode, address.city].filter(Boolean).join(', '), 240) };
      if (!state.settings) return { status: 'configuration_required', billing };
      try { prepare(order, customer, state.settings, now()); return { status: 'available', billing }; }
      catch { return { status: state.requests.some(r => r.orderId === order.id) ? 'requested' : 'validation_required', billing }; }
    },
    async issue(order, customer, { request = false, billing } = {}) { return transact(async state => {
      const previous = find(state, order.id);
      if (previous) { if (previous.customerId !== customer?.id) fail('Facture introuvable.', 404); return recordView(previous); }
      try {
        if (!state.settings) fail('Le restaurant doit activer la facturation avant émission.');
        const snapshot = prepare(order, customer, state.settings, now(), billing), year = parisDay(snapshot.issuedAt).slice(0, 4);
        const highest = Math.max(0, ...state.records.filter(r => r.snapshot.source !== 'laddition' && r.snapshot.number.startsWith('WEB-' + year + '-')).map(r => Number(r.snapshot.number.split('-').pop())));
        const sequence = state.nextByYear[year] ?? 1;
        if (!Number.isSafeInteger(sequence) || sequence !== highest + 1 || sequence > 999999) fail('Séquence comptable à vérifier.', 503);
        snapshot.number = `WEB-${year}-${String(sequence).padStart(6, '0')}`; snapshot.seller = structuredClone(state.settings.seller);
        const pdf = await render(snapshot);
        if (!Buffer.isBuffer(pdf) || pdf.length < 100 || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) fail('Le PDF n’a pas pu être vérifié.', 503);
        state.records.push({ orderId: order.id, customerId: customer.id, snapshot, snapshotSha256: sha(JSON.stringify(snapshot)), pdfBase64: pdf.toString('base64'), pdfSha256: sha(pdf), links: [] });
        state.nextByYear[year] = sequence + 1;
        state.requests = state.requests.filter(r => r.orderId !== order.id);
        await write(state); return recordView(state.records.at(-1));
      } catch (error) {
        if (!request || error.statusCode !== 409) throw error;
        if (!state.requests.some(r => r.orderId === order.id)) { state.requests.push({ orderId: order.id, requestedAt: now().toISOString() }); await write(state); }
        return { status: 'requested', message: 'Demande reçue. Le restaurant doit vérifier cette facture avant sa mise à disposition.' };
      }
    }); },
    async importOriginal(order, customer, input) { return transact(async state => {
      if (!order || order.payment?.status !== 'PAID' || order.customerId !== customer?.id || order.isTest || order.isReview || order.kioskGuest || order.source === 'uber' || order.externalSource)
        fail('Une commande Bibou réglée et son compte client sont nécessaires.', 400);
      if (!object(input) || Object.keys(input).some(k => !['confirm', 'source', 'number', 'totalCents', 'documentDate', 'sameSaleConfirmed', 'pdfBase64'].includes(k))
        || input.confirm !== true || input.sameSaleConfirmed !== true || input.source !== 'laddition' || !originalNumber(input.number) || input.number.startsWith('WEB-')
        || input.totalCents !== cents(order.paidTotal ?? order.total) || !/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate || ''))
        fail('Confirmez que le PDF original correspond à cette vente et au montant payé.', 400);
      const date = new Date(input.documentDate + 'T12:00:00Z');
      if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== input.documentDate || input.documentDate > parisDay(now())) fail('Date du document invalide.', 400);
      if (typeof input.pdfBase64 !== 'string' || input.pdfBase64.length > 800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.pdfBase64)) fail('PDF original invalide ou trop volumineux.', 400);
      const pdf = Buffer.from(input.pdfBase64, 'base64');
      if (pdf.toString('base64') !== input.pdfBase64 || pdf.length < 100 || pdf.subarray(0, 5).toString() !== '%PDF-' || !pdf.subarray(-1024).includes(Buffer.from('%%EOF')))
        fail('Le document doit être un PDF original valide.', 400);
      const previous = find(state, order.id);
      if (previous) {
        if (previous.customerId === customer.id && previous.snapshot.source === 'laddition' && previous.snapshot.number === input.number && previous.pdfSha256 === sha(pdf)) return recordView(previous);
        fail('Une facture est déjà associée à cette commande. Aucun remplacement effectué.');
      }
      if (state.records.some(r => r.snapshot.number === input.number)) fail('Ce numéro de facture est déjà associé à une autre commande.');
      const snapshot = { version: 1, source: 'laddition', number: input.number, orderId: order.id, orderNumber: order.number, customerId: customer.id,
        customerName: clean(order.customerName || customer.name), totalCents: input.totalCents, documentDate: input.documentDate,
        issuedAt: input.documentDate + 'T12:00:00Z', importedAt: now().toISOString(), sameSaleConfirmed: true };
      const record = { orderId: order.id, customerId: customer.id, snapshot, snapshotSha256: sha(JSON.stringify(snapshot)), pdfBase64: input.pdfBase64, pdfSha256: sha(pdf), links: [] };
      state.records.push(record); state.requests = state.requests.filter(r => r.orderId !== order.id);
      await write(state); return recordView(record);
    }); },
    async pdf(orderId, customerId) { const record = find(await read(), orderId); if (!record || (customerId !== undefined && record.customerId !== customerId)) fail('Facture non émise.', 404); return { buffer: Buffer.from(record.pdfBase64, 'base64'), filename: filenameFor(record) }; },
    async prepareSms(orderId, customer, expectedPhone) { return transact(async state => {
      const record = find(state, orderId);
      if (!record || record.customerId !== customer?.id) fail('Facture introuvable.', 404);
      if (!/^\+33[67]\d{8}$/.test(expectedPhone || '') || expectedPhone !== customer.phone) fail('Le numéro destinataire doit être vérifié.', 400);
      state.sms ||= [];
      const previous = state.sms.find(s => s.orderId === orderId && ['sending', 'accepted', 'uncertain'].includes(s.status));
      if (previous) fail('Un envoi est déjà accepté ou reste à vérifier. Aucun doublon envoyé.');
      const token = crypto.randomBytes(24).toString('base64url'), id = crypto.randomUUID(), expiresAt = +now() + 7 * 86400000;
      record.links.push({ digest: sha(token), expiresAt });
      state.sms.push({ id, orderId, status: 'sending', attemptedAt: now().toISOString(), phoneHash: sha(expectedPhone) });
      await write(state); return { id, token, expiresAt };
    }); },
    async finishSms(id, status) { return transact(async state => {
      const job = (state.sms || []).find(s => s.id === id);
      if (job?.status === 'sending') { job.status = ['accepted', 'rejected'].includes(status) ? status : 'uncertain'; job.finishedAt = now().toISOString(); await write(state); }
      return { status: job?.status || 'uncertain' };
    }); },
    async access(token) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(token || '')) fail('Lien de facture invalide ou expiré.', 404);
      const digest = sha(token), state = await read();
      const record = state.records.find(r => r.links.some(l => l.digest === digest && l.expiresAt > +now()));
      if (!record) fail('Lien de facture invalide ou expiré.', 404);
      return { orderId: record.orderId, customerId: record.customerId, filename: filenameFor(record), buffer: Buffer.from(record.pdfBase64, 'base64') };
    }
  };
}
module.exports = { createInvoiceStore, prepare, allocate, validateSettings, rateFor };
