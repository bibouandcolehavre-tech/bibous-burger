const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const ratingKey = id => typeof id === 'string' ? id.replace(/-menu$/, '') : '';
const eligible = order => order?.payment?.status === 'PAID' && order.status === 'delivered' && !order.reviewMode;
function orderArticles(order) {
  return [...new Map((order.items || []).map(item => [ratingKey(item.productId), { productId: ratingKey(item.productId), name: item.name }])).values()];
}
function customerOrderRatings(database, order) {
  const entries = (database.articleRatings || []).filter(r => r.orderId === order.id && r.customerId === order.customerId);
  return { orderId: order.id, number: order.number, eligible: eligible(order), articles: orderArticles(order).map(p => ({ ...p, stars: entries.find(r => r.productId === p.productId)?.stars || null })) };
}
function saveArticleRatings(database, order, input, now = new Date()) {
  if (!eligible(order)) fail('Tu pourras noter tes articles une fois la commande remise ou livrée.', 409);
  if (!input || Object.keys(input).some(k => k !== 'ratings') || !Array.isArray(input.ratings) || !input.ratings.length || input.ratings.length > 50) fail('Choisis une note pour au moins un article.');
  const allowed = new Set(orderArticles(order).map(p => p.productId)), seen = new Set();
  for (const r of input.ratings) {
    if (!r || Object.keys(r).some(k => !['productId', 'stars'].includes(k)) || !allowed.has(r.productId) || seen.has(r.productId) || !Number.isInteger(r.stars) || r.stars < 1 || r.stars > 5) fail('Note invalide ou article absent de cette commande.');
    seen.add(r.productId);
  }
  database.articleRatings ||= [];
  for (const r of input.ratings) {
    const previous = database.articleRatings.find(entry => entry.orderId === order.id && entry.customerId === order.customerId && entry.productId === r.productId);
    if (previous) { previous.stars = r.stars; previous.updatedAt = now.toISOString(); }
    else database.articleRatings.push({ orderId: order.id, customerId: order.customerId, productId: r.productId, stars: r.stars, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  }
  return customerOrderRatings(database, order);
}
function publicArticleRatings(database) {
  const orders = new Map((database.orders || []).filter(eligible).map(order => [order.id, order]));
  const groups = new Map(), seen = new Set();
  for (const r of database.articleRatings || []) {
    const order = orders.get(r.orderId), key = r.orderId + ':' + r.productId;
    if (!order || order.customerId !== r.customerId || !r.customerId || !Number.isInteger(r.stars) || r.stars < 1 || r.stars > 5 || seen.has(key) || !orderArticles(order).some(p => p.productId === r.productId)) continue;
    seen.add(key);
    const group = groups.get(r.productId) || { count: 0, sum: 0, satisfied: 0 };
    group.count++; group.sum += r.stars; if (r.stars >= 4) group.satisfied++; groups.set(r.productId, group);
  }
  return Object.fromEntries([...groups].map(([id, { count, sum, satisfied }]) => [id, { count, percent: Math.round(satisfied / count * 100), averageStars: Math.round(sum / count * 100) / 100 }]));
}
function deleteCustomerRatings(database, customerId) {
  if (Array.isArray(database.articleRatings)) database.articleRatings = database.articleRatings.filter(r => r.customerId !== customerId);
}
module.exports = { ratingKey, customerOrderRatings, saveArticleRatings, publicArticleRatings, deleteCustomerRatings };
