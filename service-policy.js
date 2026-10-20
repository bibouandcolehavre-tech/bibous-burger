// Shared by the customer app and the server. Amounts exclude fees and discounts.
const SLOT_MINUTES = 20;
const preparationMinutes = subtotal => {
  const amount = Math.round(Number(subtotal) * 100);
  if (!Number.isFinite(amount) || Number(subtotal) < 0) throw new Error('Montant du panier invalide.');
  return amount < 4000 ? 15 : amount <= 10000 ? 30 : 35;
};
const PREPARATION_LABEL = 'Préparation : moins de 40 € : 15 min · De 40 à 100 € inclus : 30 min · Au-delà de 100 € : 35 min. Le temps de trajet et l’attente liée aux commandes en cours s’ajoutent pour la livraison.';
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const clockMinutes = slot => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(slot || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const regularSlotsForWeekday = (weekday, slotMinutes = SLOT_MINUTES) => {
  const windows = weekday === 0 ? [[19, 21]] : weekday === 6 ? [[19, 22]] : [[12, 14], [19, 22]];
  return windows.flatMap(([start, end]) => Array.from({ length: (end - start) * 60 / slotMinutes }, (_, i) => clock(start * 60 + i * slotMinutes)));
};
module.exports = { SLOT_MINUTES, preparationMinutes, PREPARATION_LABEL, clock, clockMinutes, regularSlotsForWeekday };
