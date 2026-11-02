const paper = require('./paper-loyalty');
function createPaperLoyaltyHttp({ transact, readBody, authenticatedCustomer, authenticatedDashboard, send }) {
  return async (request, response, url) => {
    const match = /^\/api\/dashboard\/customers\/([^/]+)\/paper-card(?:\/(transfers|stamps)|\/operations\/([a-f0-9-]{36})\/cancel)?$/.exec(url.pathname);
    const own = url.pathname === '/api/customer/paper-card';
    if (!match && !own) return false;
    try {
      if (own) {
        if (request.method !== 'GET') return send(response, 405, { error: 'Consultation uniquement.' }), true;
        const result = await transact(db => { const customer = authenticatedCustomer(request, db);
          if (!customer || request.kioskSession) throw Object.assign(new Error('Connecte-toi sur ton téléphone pour consulter ta carte.'), { statusCode: 401 });
          return { paperCard: paper.customerState(db, customer) }; });
        send(response, 200, result); return true;
      }
      if (!authenticatedDashboard(request)) return send(response, 401, { error: 'Accès restaurant requis.' }), true;
      const action = match[2] === 'transfers' ? 'transfer' : match[2] === 'stamps' ? 'stamp' : match[3] ? 'cancel' : 'view';
      if (request.method !== (action === 'view' ? 'GET' : 'POST')) return send(response, 405, { error: 'Action indisponible.' }), true;
      const input = action === 'view' ? null : await readBody(request);
      const result = await transact(db => { const customer = db.customers.find(c => c.id === decodeURIComponent(match[1]));
        if (!customer) throw Object.assign(new Error('Compte client introuvable.'), { statusCode: 404 });
        return action === 'view' ? paper.staffState(db, customer) : action === 'cancel' ? paper.cancel(db, customer, match[3], input) : paper.credit(db, customer, input, action);
      }, action !== 'view');
      send(response, 200, result); return true;
    } catch (error) { send(response, [400, 401, 403, 404, 405, 409, 413].includes(error.statusCode) ? error.statusCode : 503,
      { error: error.statusCode ? error.message : 'La reprise de carte est momentanément indisponible. Rechargez la fiche avant de réessayer.' }); return true; }
  };
}
module.exports = { createPaperLoyaltyHttp };
