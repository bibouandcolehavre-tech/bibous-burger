const TIME_ZONE = "Europe/Paris";
const POINTS_PER_ORDER = 20;
const BURGER_POINTS = 10;
const MENU_POINTS = 15;
const { qualifiesForAdvancePickup } = require("./availability");

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
    customer.weeklyWeightedBasePoints = Math.max(0, Number(customer.weeklyWeightedBasePoints) || 0);
    customer.weeklyProgramPoints = Math.max(0, Number(customer.weeklyProgramPoints) || 0);
    return true;
  }
  if (customer.loyaltyWeekStart === currentWeek) return false;
  customer.loyaltyWeekStart = currentWeek;
  customer.weeklyOrders = 0;
  customer.weeklyWeightedBasePoints = 0;
  customer.weeklyProgramPoints = 0;
  return true;
};

const grantLoyaltyForOrder = (customer, order, value = new Date(), options = {}) => {
  const changedWeek = ensureCurrentLoyaltyWeek(customer, value);
  if (order.loyaltyGrantedAt || order.status === "cancelled") return { pointsAdded: 0, changed: changedWeek };

  const previousOrders = Math.max(0, Number(customer.weeklyOrders) || 0);
  const nextOrders = previousOrders + 1;
  const bibouPlusMultiplier = options.bibouPlus ? 2 : 1;
  // Opt-in flag is set by the server on new orders only, never from client input.
  const pickupMultiplier = order.pickupAdvanceBonusApplied === true && qualifiesForAdvancePickup(order) ? 2 : 1;
  const hasConfiguredBasePoints = Object.prototype.hasOwnProperty.call(order, "loyaltyBasePoints");
  const basePoints = hasConfiguredBasePoints
    ? Math.max(0, Number(order.loyaltyBasePoints) || 0)
    : POINTS_PER_ORDER;
  const previousWeightedBasePoints = Math.max(0, Number(customer.weeklyWeightedBasePoints) || (previousOrders * POINTS_PER_ORDER));
  const nextWeightedBasePoints = previousWeightedBasePoints + (basePoints * bibouPlusMultiplier * pickupMultiplier);
  const previousProgramPoints = previousOrders ? previousWeightedBasePoints * Math.min(previousOrders, 3) : 0;
  const nextProgramPoints = nextWeightedBasePoints * Math.min(nextOrders, 3);
  const pointsAdded = nextProgramPoints - previousProgramPoints;
  customer.weeklyOrders = nextOrders;
  customer.weeklyWeightedBasePoints = nextWeightedBasePoints;
  customer.weeklyProgramPoints = nextProgramPoints;
  customer.points = Math.max(0, Number(customer.points) || 0) + pointsAdded;
  order.loyaltyGrantedAt = value.toISOString();
  order.loyaltyPointsAdded = pointsAdded;
  order.loyaltyBasePoints = basePoints;
  order.loyaltyWeightedBasePoints = basePoints * bibouPlusMultiplier * pickupMultiplier;
  order.loyaltyBibouPlusMultiplier = bibouPlusMultiplier;
  order.loyaltyPickupMultiplier = pickupMultiplier;
  order.loyaltyWeekStart = customer.loyaltyWeekStart;
  return { pointsAdded, changed: true };
};

const revokeLoyaltyForOrder = (customer, order, value = new Date()) => {
  if (!order.loyaltyGrantedAt || order.loyaltyRevokedAt) return false;
  const currentWeek = weekStartKey(value);
  const orderWeek = order.loyaltyWeekStart || weekStartKey(new Date(order.loyaltyGrantedAt));
  if (orderWeek === currentWeek) {
    ensureCurrentLoyaltyWeek(customer, value);
    const currentOrders = Math.max(0, Number(customer.weeklyOrders) || 0);
    const currentWeightedBasePoints = Math.max(0, Number(customer.weeklyWeightedBasePoints) || 0);
    const currentProgramPoints = Math.max(0, Number(customer.weeklyProgramPoints) || (currentWeightedBasePoints * Math.min(currentOrders, 3)));
    const nextOrders = Math.max(0, currentOrders - 1);
    const nextWeightedBasePoints = Math.max(0, currentWeightedBasePoints - (Number(order.loyaltyWeightedBasePoints) || Number(order.loyaltyBasePoints) || 0));
    const nextProgramPoints = nextWeightedBasePoints * Math.min(nextOrders, 3);
    customer.points = Math.max(0, (Number(customer.points) || 0) - Math.max(0, currentProgramPoints - nextProgramPoints));
    customer.weeklyOrders = nextOrders;
    customer.weeklyWeightedBasePoints = nextWeightedBasePoints;
    customer.weeklyProgramPoints = nextProgramPoints;
  } else {
    customer.points = Math.max(0, (Number(customer.points) || 0) - (Number(order.loyaltyPointsAdded) || 0));
  }
  order.loyaltyRevokedAt = value.toISOString();
  return true;
};

module.exports = {
  BURGER_POINTS,
  MENU_POINTS,
  ensureCurrentLoyaltyWeek,
  grantLoyaltyForOrder,
  revokeLoyaltyForOrder,
  weekStartKey,
  weeklyPointsForOrders
};
