const { REWARD_DEFINITIONS } = require("./rewards");
const { bibouPlusStatus } = require("./bibou-plus");
const { weekStartKey } = require("./loyalty");
const { orderProductInsights } = require("./order-insights");

const PRESTIGES = REWARD_DEFINITIONS.map((reward, index) => ({
  level: index + 1, points: reward.points,
  name: ["Débutant", "Gourmand", "Ambassadeur", "Légende", "Mythique"][index],
  metal: ["Bronze", "Argent", "Or", "Platine", "Diamant"][index]
}));
const finite = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const date = (value) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const phoneDigits = (value) => String(value || "").replace(/\D/g, "").replace(/^(?:0033|33)(?=\d{9}$)/, "0");
const paidActive = (order) => order.payment?.status === "PAID" && order.status !== "cancelled";
const orderDate = (order) => date(order.payment?.paidAt) || date(order.createdAt);
const latestFirst = (a, b) => (Date.parse(orderDate(b)) || 0) - (Date.parse(orderDate(a)) || 0) || finite(b.number) - finite(a.number);

function customerIndex(database, now) {
  const orders = new Map();
  const ordersById = new Map();
  const referrals = new Map();
  const claims = new Map();
  for (const order of database.orders || []) {
    ordersById.set(order.id, order);
    if (!orders.has(order.customerId)) orders.set(order.customerId, []);
    orders.get(order.customerId).push(order);
  }
  for (const claim of database.rewardClaims || []) {
    if (!claims.has(claim.customerId)) claims.set(claim.customerId, []);
    claims.get(claim.customerId).push(claim);
  }
  for (const customer of database.customers || []) {
    const sponsorId = customer.referredByCustomerId;
    if (!sponsorId || sponsorId === customer.id) continue;
    if (!referrals.has(sponsorId)) referrals.set(sponsorId, { invited: 0, validated: 0, pending: 0 });
    const counts = referrals.get(sponsorId);
    const order = ordersById.get(customer.referralRewardOrderId);
    const validated = Boolean(customer.referralRewardGrantedAt && order && order.customerId === customer.id && paidActive(order) && order.referralRewardGrantedAt && !order.referralRewardRevokedAt && order.referralSponsorCustomerId === sponsorId);
    counts.invited++;
    counts[validated ? "validated" : "pending"]++;
  }
  return { orders, referrals, claims, week: weekStartKey(now) };
}

function customerSummary(customer, index, now) {
  const points = finite(customer.points);
  const activeOrders = (index.orders.get(customer.id) || []).filter(paidActive).sort(latestFirst);
  const plus = bibouPlusStatus(customer, now);
  const currentWeek = customer.loyaltyWeekStart === index.week;
  const weeklyOrders = currentWeek ? finite(customer.weeklyOrders) : 0;
  return {
    id: customer.id, name: customer.name || "Client sans prénom", phone: customer.phone || "",
    createdAt: date(customer.createdAt), points,
    prestige: PRESTIGES.filter((level) => points >= level.points).at(-1) || null,
    nextPrestige: PRESTIGES.find((level) => points < level.points) || null,
    bibouPlus: { active: plus.active, expiresAt: date(plus.expiresAt) },
    weekly: { orders: weeklyOrders, multiplier: Math.max(1, Math.min(3, weeklyOrders)), points: currentWeek ? finite(customer.weeklyProgramPoints) : 0 },
    orders: { count: activeOrders.length, amount: Math.round(activeOrders.reduce((sum, order) => sum + finite(order.total), 0) * 100) / 100, lastPaidAt: activeOrders.length ? orderDate(activeOrders[0]) : null },
    referrals: index.referrals.get(customer.id) || { invited: 0, validated: 0, pending: 0 },
    referralCode: customer.referralCode || ""
  };
}

function listDashboardCustomers(database, { query = "", filter = "all", offset = 0, limit = 25 } = {}, now = new Date()) {
  const index = customerIndex(database, now);
  const all = (database.customers || []).map((customer) => customerSummary(customer, index, now));
  const needle = normalize(query).slice(0, 100);
  const digits = phoneDigits(query);
  const filtered = all.filter((customer) => {
    const matches = !needle || normalize(customer.name).includes(needle) || normalize(customer.referralCode).includes(needle) || (/^[+\d\s().-]+$/.test(String(query)) && digits.length >= 2 && phoneDigits(customer.phone).includes(digits));
    return matches && (filter !== "plus" || customer.bibouPlus.active) && (filter !== "sponsors" || customer.referrals.invited > 0);
  }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(finite(limit)) || 25));
  const safeOffset = Math.min(Math.floor(finite(offset)), Math.max(0, Math.floor((filtered.length - 1) / safeLimit) * safeLimit));
  return {
    generatedAt: now.toISOString(),
    summary: { customers: all.length, bibouPlus: all.filter((customer) => customer.bibouPlus.active).length, points: all.reduce((sum, customer) => sum + customer.points, 0), validatedReferrals: all.reduce((sum, customer) => sum + customer.referrals.validated, 0) },
    total: filtered.length, offset: safeOffset, limit: safeLimit,
    customers: filtered.slice(safeOffset, safeOffset + safeLimit)
  };
}

function dashboardCustomerDetail(database, id, now = new Date()) {
  const customer = (database.customers || []).find((item) => item.id === id);
  if (!customer) return null;
  const index = customerIndex(database, now);
  const summary = customerSummary(customer, index, now);
  const claims = index.claims.get(id) || [];
  const paidOrders = (index.orders.get(id) || []).filter((order) => order.payment?.status === "PAID").sort(latestFirst);
  const favoriteProducts = orderProductInsights(paidOrders.filter((order) => order.status !== "cancelled")).slice(0, 3);
  return {
    customer: summary,
    favoriteProducts,
    rewards: REWARD_DEFINITIONS.map((reward) => {
      const claim = claims.find((item) => item.rewardId === reward.id);
      return { ...reward, status: claim?.status || (summary.points >= reward.points ? "available" : "locked"), remainingPoints: Math.max(0, reward.points - summary.points), code: claim?.status === "active" ? claim.code : null };
    }),
    recentOrders: paidOrders.map((order) => ({
      number: order.number, status: order.status, paidAt: orderDate(order), serviceDate: order.serviceDate || null, slot: order.slot || "", method: order.method, comment: String(order.comment || ""),
      items: (order.items || []).map((item) => ({ productId: item.productId, name: item.name, quantity: finite(item.quantity) || 1, price: finite(item.price), options: (item.options || []).map((option) => ({ groupId: option.groupId, label: option.label, price: finite(option.price) })) })),
      subtotal: finite(order.subtotal), discount: finite(order.discount), discountLabel: order.discountLabel || "", discountRate: finite(order.discountRate),
      welcomeRewardApplied: order.welcomeRewardApplied === true, bibouPlusApplied: order.bibouPlusApplied === true,
      standardDeliveryFee: finite(order.standardDeliveryFee), deliveryFee: finite(order.deliveryFee), total: finite(order.total),
      pointsAdded: finite(order.loyaltyPointsAdded)
    })),
    // No delivery addresses, session tokens, payment references or provider URLs.
  };
}

module.exports = { PRESTIGES, listDashboardCustomers, dashboardCustomerDetail };
