(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KrokliDeliveryParser = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const tidy = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const street = /\b(?:rue|avenue|av\.?|boulevard|bd\.?|quai|place|impasse|allee|route|chemin|cours|square|residence|passage|hameau)\b/i;
  function parse(text) {
    if (typeof text !== 'string' || text.length > 20000) throw Error('Texte de commande invalide.');
    const lines = text.split(/\r?\n/).map(tidy).filter(Boolean);
    const fields = { reference: '', customerName: '', phone: '', phoneExtension: '', address: '', postalCode: '', city: '', notes: '', amountCents: null };
    const warnings = [];
    // Never silently choose a restaurant address or one of several destinations.
    const candidates = lines.map((line, index) => ({line, index, norm:fold(line)}))
      .filter(item => /\d/.test(item.line) && street.test(item.norm))
      .filter(item => !/\b(?:restaurant|depart|retrait|pickup|facturation)\s*[:\-]/.test(item.norm));
    const destinationIndex = lines.findIndex(line => /^(?:adresse\s*(?:de\s*)?(?:livraison|du client)|livrer a|destination)\s*:?$/i.test(fold(line)));
    const selected = destinationIndex >= 0 ? candidates.find(item => item.index > destinationIndex && item.index <= destinationIndex + 3) : candidates.length === 1 ? candidates[0] : null;
    if (selected) {
      fields.address = selected.line.replace(/^(?:adresse\s*(?:de\s*)?(?:livraison|du client)|livrer a|destination)\s*[:\-]\s*/i, '');
      const local = [fields.address, ...lines.slice(selected.index + 1, selected.index + 3)];
      const locality = local.map(line => line.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{1,70})/)).find(Boolean);
      if (locality) {
        fields.postalCode = locality[1]; fields.city = tidy(locality[2]);
        fields.address = fields.address.replace(new RegExp('[, ]*' + locality[1] + '\\s+.*$'), '').trim();
      }
    } else if (candidates.length > 1) warnings.push('Plusieurs adresses : sélectionnez vous-même la destination du client.');
    const phoneCandidates = [];
    for (const line of lines) {
      const matches = line.match(/(?<!\d)(?:\+33|0033|0)[ .\-]?[1-9](?:[ .\-]?\d{2}){4}(?!\d)/g) || [];
      for (const match of matches) {
        const value = match.replace(/[ .\-]/g, '').replace(/^0033/, '+33');
        if (!phoneCandidates.includes(value)) phoneCandidates.push(value);
      }
      const extension = fold(line).match(/(?:code\s*(?:telephone|telephonique|d'appel)?|pin|poste|extension)\s*[:#\-]?\s*(\d{3,10})\b/i);
      if (extension) fields.phoneExtension = extension[1];
      const name = line.match(/^(?:client|nom|destinataire)\s*[:\-]\s*(.{2,80})$/i);
      if (name) fields.customerName = tidy(name[1]);
      const reference = line.match(/^(?:commande|order)(?:\s*(?:n[°o.]?|numero|number))?\s*[:#\-]?\s*#?([A-Z0-9][A-Z0-9_-]{2,39})\s*$/i);
      if (reference) fields.reference = reference[1];
    }
    if (phoneCandidates.length === 1) fields.phone = phoneCandidates[0];
    else if (phoneCandidates.length > 1) warnings.push('Plusieurs téléphones : vérifiez lequel permet de joindre le client.');
    // Only explicit grand totals. Never infer a total from item prices, tips or fees.
    const totals = lines.filter(line => /^(?:total|montant total|total paye|total de la commande)\b/i.test(fold(line)) && !/^total\s*(?:articles|produits|ht|tva)/i.test(fold(line)))
      .map(line => line.match(/(?:^|\s|:)\s*(\d{1,5})[,.](\d{2})\s*(?:€|eur)?\s*$/i)).filter(Boolean)
      .map(match => Number(match[1]) * 100 + Number(match[2]));
    if (totals.length && new Set(totals).size === 1) fields.amountCents = totals[0];
    else if (totals.length > 1) warnings.push('Plusieurs totaux : vérifiez le montant de la commande.');
    if (!fields.address || !fields.postalCode || !fields.city) warnings.push('Adresse à compléter avant de créer la course.');
    if (!fields.phone) warnings.push('Téléphone non reconnu : à compléter, ou confirmer son absence.');
    if (!fields.reference) warnings.push('Référence Uber absente : ajoutez-la si elle est visible.');
    return { fields, warnings, automaticDispatch: false };
  }
  function destination(value) {
    const text=tidy(value).replace(/,?\s+France\s*$/i,'');
    const match=text.match(/^(.+?)[,\s]+(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{1,79})$/);
    if(!match||match[1].trim().length<5)return null;
    return {address:match[1].replace(/[,\s]+$/,'').trim(),postalCode:match[2],city:match[3].trim()};
  }
  return { parse, destination };
});
