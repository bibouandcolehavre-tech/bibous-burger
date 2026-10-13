const { amendmentCatalog, validateAndPriceOrderItems, PRODUCT_CATALOG } = require('./catalog');
const amendments = require('./order-amendments');
const { serviceSlotInstant } = require('./availability');
const crypto = require('node:crypto');
const fail = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
function category(id) {
  const p = PRODUCT_CATALOG[id];
  if (!p) return null;
  return p.kind === 'naan' ? 'naans' : p.menu || id === 'taurus' || ['solo', 'duo'].includes(p.kind) ? 'menus' : id.startsWith('drink-') ? 'drinks' : id.startsWith('dessert-') ? 'desserts' : id.startsWith('frites-') ? 'fries' : p.kind === 'custom' ? 'burgers' : p.kind ? 'snacks' : 'burgers';
}
function groupCategory(group) {
  return group === 'drink' || group.startsWith('duo-drink') ? 'drinks' : group.includes('dessert') ? 'desserts' : ['menu-fries', 'solo-fries', 'duo-fries-one', 'duo-fries-two', 'sides'].includes(group) ? 'fries' : null;
}
function targets(order) {
  return (order.items || []).flatMap((item, line) => [
    { key: `${line}:product`, line, productId: item.productId, category: category(item.productId), label: item.name },
    ...(item.options || []).filter(o => groupCategory(o.groupId)).map(o => ({ key: `${line}:${o.groupId}:${o.id}`, line, groupId: o.groupId, id: o.id, category: groupCategory(o.groupId), label: o.label })),
    ...(item.productId.endsWith('-menu') && !item.options?.some(o => o.groupId === 'menu-fries') ? [{ key: `${line}:menu-fries:maison`, line, groupId: 'menu-fries', id: 'maison', category: 'fries', label: 'Frites maison incluses', implicit: true }] : []),
    ...(item.productId.startsWith('naan-') && item.options?.some(o => o.groupId === 'naan-side' && o.id === 'fries') ? [{ key: `${line}:naan-side:fries`, line, groupId: 'naan-side', id: 'fries', category: 'fries', label: 'Frites maison du menu naan' }] : []),
  ]).filter(t => t.category);
}
function requestReplacement(order, input, now = Date.now()) {
  const instant = serviceSlotInstant(order.serviceDate, order.slot?.slice(0, 5), order.method);
  if (order.payment?.status !== 'PAID' || !order.customerId || !['confirmed', 'awaiting_customer'].includes(order.status) || order.amendment?.status === 'accepted' || !instant || instant.getTime() <= now || input?.revision !== (order.amendment?.revision || 0) || (order.amendment?.revision || 0) >= 10) fail('La commande a changé ou ne peut plus être modifiée.');
  if (!Array.isArray(input.targets) || !input.targets.length || input.targets.length > 40 || new Set(input.targets).size !== input.targets.length || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 300) fail('Indique les articles indisponibles et un motif.');
  const all = targets(order), requested = input.targets.map(key => all.find(t => t.key === key));
  if (requested.some(t => !t) || requested.some(t => !t.groupId && requested.some(other => other !== t && other.line === t.line))) fail('Choisis un article entier ou ses composants, pas les deux.');
  order.amendmentHistory ||= [];
  if (order.amendment) order.amendmentHistory.push({ ...order.amendment, status: 'superseded' });
  const original = structuredClone({ items: order.items, subtotal: order.subtotal, discount: order.discount, discountRate: order.discountRate, deliveryFee: order.deliveryFee, total: order.total });
  order.amendment = { mode: 'category-choice', revision: (order.amendment?.revision || 0) + 1, status: 'pending', phase: 'choosing', original, proposal: { ...structuredClone(original), reason: input.reason.trim(), refundAmount: 0 }, targets: requested, createdAt: new Date(now).toISOString(), expiresAt: new Date(Math.min(now + 30 * 60000, instant.getTime())).toISOString() };
  order.status = 'awaiting_customer'; order.updatedAt = new Date(now).toISOString();
  return order.amendment;
}
function pending(order, revision, now) {
  const a = order.amendment;
  if (!a || a.mode !== 'category-choice' || a.status !== 'pending' || order.status !== 'awaiting_customer' || (revision !== undefined && revision !== a.revision) || Date.parse(a.expiresAt) <= now) fail('Cette demande est expirée ou a déjà reçu une réponse.');
  return a;
}
function options(order, stock = {}, now = Date.now()) {
  const a = pending(order, undefined, now), catalog = amendmentCatalog(stock);
  const missingProducts = new Set(a.targets.filter(t => !t.groupId).map(t => t.productId));
  return { revision: a.revision, phase: a.phase, reason: a.proposal.reason, expiresAt: a.expiresAt, original: a.original, proposal: a.phase === 'submitted' ? a.proposal : null, choices: a.targets.map(t => ({ ...t, alternatives: !t.groupId ? catalog.products.filter(p => catalog.definitions[p.id] && !catalog.definitions[p.id].custom && p.available && p.visible !== false && category(p.id) === t.category && !missingProducts.has(p.id)).map(p => ({ ...p, definition: { ...catalog.definitions[p.id], groups: catalog.definitions[p.id].groups.map(groupId => ({ id: groupId, ...catalog.rules[groupId], options: catalog.choices.filter(c => c.groupId === groupId && catalog.options[groupId + ':' + c.id] !== false && (groupId !== 'sauces' || (catalog.definitions[p.id].fixedSauce ? c.id === catalog.definitions[p.id].fixedSauce : !c.id.startsWith('fixed-')))) })) } })) : catalog.choices.filter(c => c.groupId === t.groupId && c.id !== t.id && catalog.options[c.groupId + ':' + c.id] !== false && !a.targets.some(other => other.groupId && other.category === t.category && other.id === c.id)).map(c => ({ ...c })) })) };
}
function submit(order, input, stock = {}, now = Date.now()) {
  const a = pending(order, input?.revision, now);
  if (!Array.isArray(input.choices) || input.choices.length !== a.targets.length || new Set(input.choices.map(c => c.target)).size !== a.targets.length) fail('Choisis un remplacement pour chaque article indisponible.');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(input.choices)).digest('hex');
  if (a.phase === 'submitted') {
    if (a.clientChoiceFingerprint === fingerprint) return a;
    fail('Tes choix sont déjà envoyés. Attends la réponse du restaurant avant de les modifier.');
  }
  const offered = options(order, stock, now), items = a.original.items.map(item => ({ productId: item.productId, quantity: item.quantity, selections: item.options.map(({ groupId, id }) => ({ groupId, id })) }));
  for (const target of a.targets) {
    const selected = input.choices.find(c => c.target === target.key), alternatives = offered.choices.find(t => t.key === target.key).alternatives;
    const selectedId = selected?.productId || selected?.id;
    if (!alternatives.some(p => p.id === selectedId)) fail('Un remplacement n’est plus disponible ou ne correspond pas à cette catégorie.');
    const item = items[target.line];
    if (!target.groupId) {
      item.productId = selectedId;
      item.selections = selected.selections || [];
      if (target.category === 'naans') item.selections = a.original.items[target.line].options.map(({ groupId, id }) => ({ groupId, id }));
    } else {
      const index = item.selections.findIndex(c => c.groupId === target.groupId && c.id === target.id);
      if (index < 0 && !target.implicit) fail('Le composant initial n’existe plus.');
      const choice = { groupId: target.groupId, id: selectedId };
      if (index < 0) item.selections.push(choice); else item.selections[index] = choice;
    }
  }
  // Authoritative server prices, stock, recipe validation and retained discounts.
  const preview = amendments.preview(order, { revision: a.revision, reason: a.proposal.reason, items }, stock, now);
  a.proposal = preview.proposal; a.phase = 'submitted'; a.clientChoiceFingerprint = fingerprint; a.clientSubmittedAt = new Date(now).toISOString();
  order.updatedAt = a.clientSubmittedAt;
  return a;
}
function confirm(order, input, stock = {}, now = Date.now()) {
  const a = pending(order, input?.revision, now);
  if (!['accept', 'reject'].includes(input.decision) || a.phase !== 'submitted') fail('Aucun nouveau panier n’attend ta confirmation.');
  if (input.decision === 'reject') { a.phase = 'choosing'; a.revision++; a.proposal = { ...structuredClone(a.original), reason: a.proposal.reason, refundAmount: 0 }; return a; }
  // Recheck stock at final restaurant acceptance; never charge a hidden supplement.
  validateAndPriceOrderItems(a.proposal.items.map(item => ({ productId: item.productId, quantity: item.quantity, selections: item.options })), stock, order, new Date(order.createdAt || now));
  const mode = a.mode; delete a.mode;
  try { amendments.decide(order, { revision: a.revision, decision: 'accept' }, stock, now); }
  finally { a.mode = mode; }
  return a;
}
module.exports = { category, targets, requestReplacement, options, submit, confirm };
