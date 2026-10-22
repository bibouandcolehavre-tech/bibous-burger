'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const keyyo = require('./keyyo-call-sms');
const { createAuthRateLimiter } = require('./auth-rate-limit');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const ORIGIN = 'https://bibous-burger.onrender.com';
function createInvoiceHttp({ store, readDatabase, acquireDatabase, authenticatedCustomer, authenticatedDashboard, readBody, send, smsConfig, sendSms }) {
  const accessLimiter = createAuthRateLimiter({ limit: 20, windowMs: 60000 });
  const sender = sendSms || keyyo.createSender(smsConfig, fetch, { retryDelays: [] });
  const binary = (res, pdf) => {
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Content-Length': String(pdf.buffer.length), 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Access-Control-Allow-Origin': '*' });
    res.end(pdf.buffer);
  };
  async function withOrder(request, id, dashboard, fn) {
    if (dashboard && !authenticatedDashboard(request)) fail('Connexion restaurant requise.', 401);
    const release = await acquireDatabase();
    try {
      const db = await readDatabase();
      const customer = dashboard ? null : authenticatedCustomer(request, db);
      if (!dashboard && (!customer || request.kioskSession)) fail('Connecte-toi depuis ton téléphone pour consulter ta facture.', 401);
      const order = db.orders.find(o => o.id === id && (dashboard || o.customerId === customer.id));
      if (!order || order.payment?.status !== 'PAID') fail('Commande introuvable.', 404);
      const owner = dashboard ? db.customers.find(c => c.id === order.customerId) : customer;
      if (!owner) fail('Compte client introuvable.', 404);
      return await fn(order, owner);
    } finally { release(); }
  }
  return async function handle(request, response, url) {
    if (['/facture', '/facture.js'].includes(url.pathname)) {
      if (request.method !== 'GET') { send(response, 405, { error: 'Lecture seule.' }); return true; }
      const js = url.pathname.endsWith('.js'), body = await fs.readFile(path.join(__dirname, js ? 'invoice-access.js' : 'invoice-access.html'));
      response.writeHead(200, { 'Content-Type': js ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
      response.end(body); return true;
    }
    if (url.pathname === '/api/invoices/access') {
      if (request.method !== 'POST') { send(response, 405, { error: 'Action non disponible.' }); return true; }
      if (!accessLimiter.consume(request.socket.remoteAddress || 'unknown').allowed) fail('Trop de tentatives. Réessaie dans une minute.', 429);
      const input = await readBody(request);
      if (Object.keys(input).some(k => k !== 'token')) fail('Lien invalide.');
      const pdf = await store.access(input.token);
      const release = await acquireDatabase();
      try {
        const db = await readDatabase();
        if (!db.customers.some(c => c.id === pdf.customerId) || !db.orders.some(o => o.id === pdf.orderId && o.customerId === pdf.customerId)) fail('Lien de facture indisponible.', 404);
      } finally { release(); }
      binary(response, pdf); return true;
    }
    const customerRoute = /^\/api\/customer\/orders\/(order-\d+)\/invoice(?:\/(pdf))?$/.exec(url.pathname);
    const dashboardRoute = /^\/api\/dashboard\/invoices\/(order-\d+)\/(status|issue|pdf|sms|import)$/.exec(url.pathname);
    if (url.pathname === '/api/dashboard/invoices/settings') {
      if (!authenticatedDashboard(request)) fail('Connexion restaurant requise.', 401);
      if (request.method === 'GET') {
        const state = await store.read(); send(response, 200, { configured: Boolean(state.settings), settings: state.settings,
          requests: state.requests, invoices: state.records.map(r => ({ orderId: r.orderId, number: r.snapshot.number, totalCents: r.snapshot.totalCents, issuedAt: r.snapshot.issuedAt })) });
      } else if (request.method === 'POST') send(response, 200, await store.configure(await readBody(request)));
      else send(response, 405, { error: 'Action non disponible.' });
      return true;
    }
    if (!customerRoute && !dashboardRoute) return false;
    const dashboard = Boolean(dashboardRoute), id = (dashboardRoute || customerRoute)[1], action = dashboardRoute?.[2] || customerRoute[2] || 'status';
    const allowed = action === 'status' || action === 'pdf' ? request.method === 'GET' || (!dashboard && action === 'status' && request.method === 'POST') : request.method === 'POST';
    if (!allowed) { send(response, 405, { error: 'Action non disponible.' }); return true; }
    let sms;
    await withOrder(request, id, dashboard, async (order, customer) => {
      if (action === 'pdf') { binary(response, await store.pdf(id, dashboard ? undefined : customer.id)); return; }
      if (action === 'status' && request.method === 'GET') { send(response, 200, await store.status(order, customer)); return; }
      const input = await readBody(request);
      if (action === 'import') { send(response, 200, await store.importOriginal(order, customer, input)); return; }
      if (action === 'sms') {
        if (input.confirm !== true || Object.keys(input).some(k => !['confirm', 'expectedPhone'].includes(k))) fail('Confirmez le destinataire et l’envoi de sa facture.');
        if (!keyyo.configured(smsConfig)) fail('L’envoi des factures par SMS doit être configuré. Aucun SMS envoyé.', 503);
        if (order.customerPhone && keyyo.phone(order.customerPhone) !== keyyo.phone(customer.phone)) fail('Le téléphone du compte a changé : vérifiez le destinataire.', 409);
        const job = await store.prepareSms(id, customer, input.expectedPhone);
        sms = { job, recipient: keyyo.phone(customer.phone), message: `Bibou's Burgers : votre facture : ${ORIGIN}/facture#${job.token} (lien valable 7 jours).` };
        return;
      }
      if (Object.keys(input).some(k => !['confirm', 'billing'].includes(k)) || input.confirm !== true || (dashboard && input.billing !== undefined)) fail('Confirmez la demande de facture.');
      const result = await store.issue(order, customer, { request: !dashboard, billing: input.billing });
      send(response, result.status === 'requested' ? 202 : 200, result);
    });
    // A slow provider must never block order/payment processing under the shared DB lock.
    if (sms) {
      let status = 'uncertain';
      try { await sender(sms.recipient, sms.message); status = 'accepted'; }
      catch (error) { if (['temporary_refusal', 'authentication_error', 'cancelled'].includes(error.keyyoReason)) status = 'rejected'; }
      send(response, status === 'accepted' ? 200 : 502, await store.finishSms(sms.job.id, status));
    }
    return true;
  };
}
module.exports = { createInvoiceHttp };
