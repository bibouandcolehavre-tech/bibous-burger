const WELCOME_DISCOUNT_RATE = 0.1;

const grantWelcomeReward = (customer, value = new Date()) => {
  if (customer.welcomeReward) return false;
  customer.welcomeReward = {
    type: "first_order_discount",
    discountRate: WELCOME_DISCOUNT_RATE,
    status: "available",
    grantedAt: value.toISOString(),
  };
  return true;
};

const welcomeRewardAvailable = (customer, orders, value = new Date(), reservationMs = 15 * 60 * 1000) => {
  if (customer?.welcomeReward?.status !== "available") return false;
  return !(orders || []).some((order) => {
    if (order.customerId !== customer.id || !order.welcomeRewardApplied || order.status === "cancelled") return false;
    if (order.payment?.status === "PAID") return true;
    const createdAt = new Date(order.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt + reservationMs > value.getTime();
  });
};

const consumeWelcomeReward = (customer, order, value = new Date()) => {
  if (!order?.welcomeRewardApplied || customer?.welcomeReward?.status !== "available") return false;
  customer.welcomeReward.status = "used";
  customer.welcomeReward.usedAt = value.toISOString();
  customer.welcomeReward.usedOrderId = order.id;
  return true;
};

const restoreWelcomeReward = (customer, order) => {
  if (!order?.welcomeRewardApplied || customer?.welcomeReward?.usedOrderId !== order.id) return false;
  customer.welcomeReward.status = "available";
  delete customer.welcomeReward.usedAt;
  delete customer.welcomeReward.usedOrderId;
  return true;
};

module.exports = {
  WELCOME_DISCOUNT_RATE,
  consumeWelcomeReward,
  grantWelcomeReward,
  restoreWelcomeReward,
  welcomeRewardAvailable,
};
