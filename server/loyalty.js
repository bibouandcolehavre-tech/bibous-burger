const TIME_ZONE = "Europe/Paris";
const POINTS_PER_ORDER = 20;

const parisDateParts = (value = new Date()) => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
);

const weekStartKey = (value = new Date()) => {
  const { year, month, day } = parisDateParts(value);
  const localCalendarDate = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (localCalendarDate.getUTCDay() + 6) % 7;
  localCalendarDate.setUTCDate(localCalendarDate.getUTCDate() - daysSinceMonday);
  return localCalendarDate.toISOString().slice(0, 10);
};

const weeklyPointsForOrders = (orderCount) => {
  const count = Math.max(0, Number(orderCount) || 0);
  const multiplier = count ? Math.min(count, 3) : 0;
  return count * POINTS_PER_ORDER * multiplier;
};

const ensureCurrentLoyaltyWeek = (customer, value = new Date()) => {
  const currentWeek = weekStartKey(value);
  if (!customer.loyaltyWeekStart) {
    customer.loyaltyWeekStart = currentWeek;
    customer.weeklyOrders = Math.max(0, Number(customer.weeklyOrders) || 0);
    return true;
  }
  if (customer.loyaltyWeekStart === currentWeek) return false;
  customer.loyaltyWeekStart = currentWeek;
  customer.weeklyOrders = 0;
  return true;
};

const grantLoyaltyForOrder = (customer, order, value = new Date()) => {
  const changedWeek = ensureCurrentLoyaltyWeek(customer, value);
  if (order.loyaltyGrantedAt) return { pointsAdded: Number(order.loyaltyPointsAdded) || 0, changed: changedWeek };

  const previousOrders = Math.max(0, Number(customer.weeklyOrders) || 0);
  const nextOrders = previousOrders + 1;
  const pointsAdded = weeklyPointsForOrders(nextOrders) - weeklyPointsForOrders(previousOrders);
  customer.weeklyOrders = nextOrders;
  customer.points = Math.max(0, Number(customer.points) || 0) + pointsAdded;
  order.loyaltyGrantedAt = value.toISOString();
  order.loyaltyPointsAdded = pointsAdded;
  order.loyaltyWeekStart = customer.loyaltyWeekStart;
  return { pointsAdded, changed: true };
};

const revokeLoyaltyForOrder = (customer, order, value = new Date()) => {
  if (!order.loyaltyGrantedAt || order.loyaltyRevokedAt) return false;
  const currentWeek = weekStartKey(value);
  const orderWeek = order.loyaltyWeekStart || weekStartKey(new Date(order.loyaltyGrantedAt));
  customer.points = Math.max(0, (Number(customer.points) || 0) - (Number(order.loyaltyPointsAdded) || 0));
  if (orderWeek === currentWeek) {
    ensureCurrentLoyaltyWeek(customer, value);
    customer.weeklyOrders = Math.max(0, (Number(customer.weeklyOrders) || 0) - 1);
  }
  order.loyaltyRevokedAt = value.toISOString();
  return true;
};

module.exports = {
  ensureCurrentLoyaltyWeek,
  grantLoyaltyForOrder,
  revokeLoyaltyForOrder,
  weekStartKey,
  weeklyPointsForOrders
};
