const crypto = require("node:crypto");

const TARGETS = [{ id: "support-payment-2026-09-22", fingerprint: "bd2059104ed075e4455f2a2d0603e6ef17c6933779254503875515f111de0351", points: 15, reason: "Geste commercial après échec du paiement" }];
const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const fingerprint = (customer) => {
  const firstName = normalize(customer?.name).split(/\s+/)[0];
  const lastFour = String(customer?.phone || "").replace(/\D/g, "").slice(-4);
  return crypto.createHash("sha256").update(`${firstName}:${lastFour}`).digest("hex");
};

function applySupportCredits(database, now = new Date()) {
  database.loyaltyAdjustments ||= [];
  let changed = false;
  for (const target of TARGETS) {
    if (database.loyaltyAdjustments.some((item) => item.id === target.id)) continue;
    const matches = (database.customers || []).filter((customer) => fingerprint(customer) === target.fingerprint);
    if (matches.length !== 1) continue;
    const customer = matches[0];
    customer.points = Math.max(0, Number(customer.points) || 0) + target.points;
    database.loyaltyAdjustments.push({ id: target.id, customerId: customer.id, amount: target.points, reason: target.reason, createdAt: now.toISOString() });
    changed = true;
  }
  return changed;
}

module.exports = { applySupportCredits };
