// ePOS-Print XML for the restaurant's networked TM-m30II. The HTTPS status
// probe works on the restaurant iPad; physical printing is still to verify.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BibouEpsonPrint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';
  const xml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
  const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const address = value => typeof value === 'string' ? clean(value) : value && typeof value === 'object'
    ? [value.address, value.postalCode, value.city].map(part => clean(part)).filter(Boolean).join(' ') : '';
  const line = value => `<text>${xml(clean(value))}&#10;</text>`;
  const wrap = content => `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="${NS}">${content}</epos-print></s:Body></s:Envelope>`;

  const statusEnvelope = () => wrap('');
  const testEnvelope = () => wrap('<text align="center" dw="true" dh="true" em="true"/>' +
    line('ESSAI BIBOU') + '<text align="left" dw="false" dh="false" em="false"/>' +
    line('AUCUNE COMMANDE REELLE') + line('Test de liaison avec le restaurant') + '<cut type="feed"/>');

  function completedOrderForTest(orders) {
    if (!Array.isArray(orders)) throw new Error('Liste de commandes invalide.');
    return orders.filter(order => order?.status === 'delivered' && order.payment?.status === 'PAID' &&
      !order.reviewMode && order.id && ['pickup', 'delivery'].includes(order.method) &&
      Array.isArray(order.items) && order.items.length > 0 && Number.isFinite(Date.parse(order.createdAt)))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
  }

  function preparationEnvelope(order, { duplicateTest = false } = {}) {
    if (!order || order.payment?.status !== 'PAID' || order.reviewMode || !order.id || !Array.isArray(order.items)) {
      throw new Error('Seule une commande réelle réglée peut être imprimée.');
    }
    if (duplicateTest && order.status !== 'delivered') throw new Error('Le duplicata de test exige une commande terminée.');
    const number = Number.isSafeInteger(Number(order.number)) ? `#${Number(order.number)}` : clean(order.id);
    const method = order.method === 'delivery' ? 'LIVRAISON' : order.method === 'pickup' ? 'RETRAIT' : null;
    if (!method) throw new Error('Mode de commande inconnu.');
    const parts = [
      '<text align="center" dw="true" dh="true" em="true"/>', line(`BIBOU'S BURGERS ${number}`),
      '<text align="left" dw="false" dh="false" em="false"/>',
      ...(duplicateTest ? [line('DUPLICATA TEST - NE PAS PREPARER'), line('COMMANDE DEJA TERMINEE')] : []),
      line('TICKET DE PREPARATION - NON FISCAL'),
      line(method),
      line(`${clean(order.serviceDate)} ${clean(order.slot)}`),
      line(`Client : ${clean(order.customerName) || 'Non renseigne'}`),
    ];
    if (order.customerPhone) parts.push(line(`Tel : ${order.customerPhone}`));
    if (method === 'LIVRAISON' && address(order.deliveryAddress)) parts.push(line(`Adresse : ${address(order.deliveryAddress)}`));
    parts.push(line('--------------------------------'));
    for (const item of order.items) {
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Quantité de produit invalide.');
      parts.push('<text em="true"/>', line(`${quantity} x ${item.name || item.productId || 'Produit'}`), '<text em="false"/>');
      for (const option of item.options || []) {
        if (option?.label) parts.push(line(`  - ${option.label}`));
      }
    }
    if (order.comment) parts.push(line('--------------------------------'), line(`Note : ${order.comment}`));
    parts.push(line('--------------------------------'), line('TICKET CUISINE - PAS UNE FACTURE'));
    if (duplicateTest) parts.push(line('DUPLICATA TEST - NE PAS PREPARER'));
    parts.push('<cut type="feed"/>');
    return wrap(parts.join(''));
  }

  function orderReceiptEnvelope(order) {
    if (!order || order.payment?.status !== 'PAID' || order.reviewMode || !order.id || !Array.isArray(order.items) || !order.items.length) {
      throw new Error('Seule une vraie commande payée peut être imprimée.');
    }
    const amount = value => {
      if (value === null || value === undefined || value === '') throw new Error('Montant de commande manquant.');
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) throw new Error('Montant de commande invalide.');
      return `${number.toFixed(2).replace('.', ',')} EUR`;
    };
    const paid = order.paidTotal ?? order.total;
    const number = Number.isSafeInteger(Number(order.number)) ? `#${Number(order.number)}` : clean(order.id);
    const dateValue = order.payment.paidAt || order.createdAt;
    const date = Number.isFinite(Date.parse(dateValue)) ? new Date(dateValue).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
    }) : 'Date non disponible';
    const parts = [
      '<text align="center" dw="true" dh="true" em="true"/>', line("BIBOU'S BURGERS"),
      '<text align="left" dw="false" dh="false" em="false"/>',
      line('BIBOU & CO - 153 quai Georges V'), line('76600 Le Havre'),
      line(`COMMANDE ${number} - ${date}`),
      line('RECAPITULATIF - NON FACTURE TVA'),
      line(order.method === 'delivery' ? 'Livraison' : order.method === 'pickup' ? 'Retrait' : 'Mode non renseigne'),
      line(`Client : ${clean(order.customerName) || 'Non renseigne'}`),
      line('--------------------------------'),
    ];
    for (const item of order.items) {
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantité de produit invalide.');
      if (item.price === null || item.price === undefined) throw new Error('Prix de produit manquant.');
      parts.push(line(`${quantity} x ${item.name || item.productId || 'Produit'}`));
      parts.push(line(`  ${amount(Number(item.price) * quantity)}`));
      for (const option of item.options || []) if (option?.label) parts.push(line(`  - ${option.label}`));
    }
    parts.push(line('--------------------------------'));
    if (Number(order.discount) > 0) parts.push(line(`Remise : -${amount(order.discount)}`));
    if (order.method === 'delivery') parts.push(line(`Livraison : ${amount(order.deliveryFee ?? 0)}`));
    parts.push('<text em="true"/>', line(`PAIEMENT INITIAL : ${amount(paid)}`), '<text em="false"/>');
    if (order.refund?.status === 'recorded') parts.push(line(`Remboursement declare : ${amount(order.refund.amount)}`));
    if (order.refund?.status === 'due') parts.push(line(`Remboursement a effectuer : ${amount(order.refund.amount)}`));
    if (order.status === 'cancelled') parts.push(line('COMMANDE ANNULEE'));
    parts.push(line('Document de commande - TVA non detaillee'), line('Demandez une facture au restaurant si besoin.'), '<cut type="feed"/>');
    return wrap(parts.join(''));
  }

  function endpoint(host, { secure = true, deviceId = 'local_printer' } = {}) {
    if (!/^([a-z0-9.-]+|\[[0-9a-f:]+\])$/i.test(String(host || ''))) throw new Error('Adresse imprimante invalide.');
    if (!/^[a-z0-9_-]{1,32}$/i.test(deviceId)) throw new Error('Identifiant imprimante invalide.');
    return `${secure ? 'https' : 'http'}://${host}/cgi-bin/epos/service.cgi?devid=${encodeURIComponent(deviceId)}&timeout=10000`;
  }

  function responseResult(responseDocument) {
    const element = responseDocument?.getElementsByTagName?.('response')?.[0];
    if (!element) throw new Error('Réponse Epson illisible.');
    return { success: /^(1|true)$/i.test(element.getAttribute('success') || ''), code: element.getAttribute('code') || '', status: element.getAttribute('status') || '' };
  }

  function send(host, documentXml, { xhrFactory = () => new XMLHttpRequest() } = {}) {
    if (typeof documentXml !== 'string' || !documentXml.startsWith('<?xml') || documentXml.length > 200000) {
      return Promise.reject(new Error('Document Epson invalide.'));
    }
    return new Promise((resolve, reject) => {
      const xhr = xhrFactory();
      xhr.open('POST', endpoint(host), true);
      xhr.timeout = 15000;
      xhr.setRequestHeader('Content-Type', 'text/xml; charset=utf-8');
      xhr.setRequestHeader('If-Modified-Since', 'Thu, 01 Jan 1970 00:00:00 GMT');
      xhr.setRequestHeader('SOAPAction', '""');
      xhr.onload = () => {
        if (xhr.status !== 200) return reject(new Error(`Réponse HTTP ${xhr.status} de l'imprimante.`));
        try { resolve(responseResult(xhr.responseXML)); }
        catch (error) { reject(error); }
      };
      xhr.onerror = () => reject(new Error('La page sécurisée ne peut pas joindre le service d’impression Epson.'));
      xhr.ontimeout = () => reject(new Error('L’imprimante ne répond pas au test du service d’impression.'));
      xhr.send(documentXml);
    });
  }

  const probe = (host, options) => send(host, statusEnvelope(), options);

  return { statusEnvelope, testEnvelope, completedOrderForTest, preparationEnvelope, orderReceiptEnvelope, endpoint, responseResult, probe, send };
});
