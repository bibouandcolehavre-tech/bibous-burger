// ePOS-Print XML for the restaurant's networked TM-m30II. This module is not
// wired into automatic printing until the printer's HTTPS service is tested.
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
  const line = value => `<text>${xml(clean(value))}&#10;</text>`;
  const wrap = content => `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="${NS}">${content}</epos-print></s:Body></s:Envelope>`;

  const statusEnvelope = () => wrap('');
  const testEnvelope = () => wrap('<text align="center" dw="true" dh="true" em="true"/>' +
    line('ESSAI BIBOU') + '<text align="left" dw="false" dh="false" em="false"/>' +
    line('AUCUNE COMMANDE REELLE') + line('Test de liaison avec le restaurant') + '<cut type="feed"/>');

  function preparationEnvelope(order) {
    if (!order || order.payment?.status !== 'PAID' || order.reviewMode || !order.id || !Array.isArray(order.items)) {
      throw new Error('Seule une commande réelle réglée peut être imprimée.');
    }
    const number = Number.isSafeInteger(Number(order.number)) ? `#${Number(order.number)}` : clean(order.id);
    const method = order.method === 'delivery' ? 'LIVRAISON' : order.method === 'pickup' ? 'RETRAIT' : null;
    if (!method) throw new Error('Mode de commande inconnu.');
    const parts = [
      '<text align="center" dw="true" dh="true" em="true"/>', line(`BIBOU'S BURGERS ${number}`),
      '<text align="left" dw="false" dh="false" em="false"/>',
      line('TICKET DE PREPARATION - NON FISCAL'),
      line(method),
      line(`${clean(order.serviceDate)} ${clean(order.slot)}`),
      line(`Client : ${clean(order.customerName) || 'Non renseigne'}`),
    ];
    if (order.customerPhone) parts.push(line(`Tel : ${order.customerPhone}`));
    if (method === 'LIVRAISON' && order.deliveryAddress) parts.push(line(`Adresse : ${order.deliveryAddress}`));
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
    parts.push(line('--------------------------------'), line('TICKET CUISINE - PAS UNE FACTURE'), '<cut type="feed"/>');
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

  return { statusEnvelope, testEnvelope, preparationEnvelope, endpoint, responseResult, probe, send };
});
