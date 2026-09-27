// Shared by the customer app and the server. Amounts exclude fees and discounts.
const SLOT_MINUTES = 20;
const preparationMinutes = subtotal => {
  const amount = Math.round(Number(subtotal) * 100);
  if (!Number.isFinite(amount) || Number(subtotal) < 0) throw new Error('Montant du panier invalide.');
  return amount < 2500 ? 20 : amount <= 6000 ? 30 : 45;
};
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const clockMinutes = slot => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(slot || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const regularSlotsForWeekday = weekday => {
  const windows = weekday === 0 ? [[19, 21]] : weekday === 6 ? [[19, 22]] : [[12, 14], [19, 22]];
  return windows.flatMap(([start, end]) => Array.from({ length: (end - start) * 60 / SLOT_MINUTES }, (_, i) => clock(start * 60 + i * SLOT_MINUTES)));
};
module.exports = { SLOT_MINUTES, preparationMinutes, clock, clockMinutes, regularSlotsForWeekday };
