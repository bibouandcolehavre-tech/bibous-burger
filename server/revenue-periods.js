const { parisDateKey } = require('./availability');

const DAY_MS = 24 * 60 * 60 * 1000;
const dateFromKey = key => new Date(`${key}T12:00:00Z`);
const shiftDateKey = (key, days) => parisDateKey(new Date(dateFromKey(key).getTime() + days * DAY_MS));

const mondayKey = (today) => {
  const weekday = dateFromKey(today).getUTCDay();
  return shiftDateKey(today, -(weekday === 0 ? 6 : weekday - 1));
};

const orderPaymentDateKey = order => {
  const value = order?.payment?.paidAt || order?.paidAt || order?.createdAt;
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? parisDateKey(date) : null;
};

const revenuePeriods = (orders = [], now = new Date()) => {
  const today = parisDateKey(now);
  const weekStart = mondayKey(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const totals = { today: 0, week: 0, month: 0 };

  for (const order of orders) {
    if (order?.payment?.status !== 'PAID' || order.status === 'cancelled') continue;
    const dateKey = orderPaymentDateKey(order);
    const total = Number(order.total);
    if (!dateKey || !Number.isFinite(total)) continue;
    if (dateKey === today) totals.today += total;
    if (dateKey >= weekStart && dateKey <= today) totals.week += total;
    if (dateKey >= monthStart && dateKey <= today) totals.month += total;
  }

  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value * 100) / 100]));
};

module.exports = { revenuePeriods };
