// Shared recipes and service rule for the next customer release. No client clock
// or stock toggle can authorize publication: that remains a server decision.
const CHEESE_NAANS = {
  'naan-poulet': { name: 'Cheese naan poulet', price: 7.9, menuPrice: 10.9, kind: 'naan', category: 'naans', lunchOnly: true,
    description: 'Un naan généreusement fourré au poulet aux saveurs orientales, avec des oignons et du Kiri fondant. Une recette douce et parfumée pour ta pause de midi.' },
  'naan-boeuf': { name: 'Cheese naan bœuf', price: 7.9, menuPrice: 10.9, kind: 'naan', category: 'naans', lunchOnly: true,
    description: 'Un naan gourmand garni de bœuf effiloché à la tomate, d’oignons caramélisés et de Kiri fondant. Une garniture généreuse, savoureuse et fondante.' },
  'naan-canard': { name: 'Cheese naan canard', price: 7.9, menuPrice: 10.9, kind: 'naan', category: 'naans', lunchOnly: true,
    description: 'Un naan généreusement fourré au canard effiloché aux cinq parfums, accompagné d’oignons et de fromage fondant. Une recette parfumée et réconfortante.' }
};
const isCheeseNaan = id => Object.hasOwn(CHEESE_NAANS, id);
function lunchSlot(slot) {
  if (typeof slot !== 'string') return false;
  const parts = slot.split(' – ');
  if (parts.length > 2 || parts.some(p => !/^\d{2}:\d{2}$/.test(p))) return false;
  const minute = p => Number(p.slice(0, 2)) * 60 + Number(p.slice(3));
  if (parts.some(p => Number(p.slice(3)) > 59)) return false;
  const start = minute(parts[0]);
  return start >= 12 * 60 && start < 14 * 60 && (parts.length === 1 || (minute(parts[1]) > start && minute(parts[1]) <= 14 * 60));
}
function parisServiceClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
function lunchOpenNow(now, slots) {
  const { minutes } = parisServiceClock(now);
  return minutes >= 720 && minutes < 840 && slots.some(slot => lunchSlot(slot) && minutes >= Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5)) && minutes < Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5)) + 20);
}
function naanLoyaltyPoints(item) {
  if (!isCheeseNaan(item?.productId)) return 0;
  return (item.options || item.selections || []).some(option => option.groupId === 'naan-format' && option.id === 'menu') ? 15 : 10;
}
module.exports = { CHEESE_NAANS, isCheeseNaan, lunchSlot, parisServiceClock, lunchOpenNow, naanLoyaltyPoints };
