const { CHEESE_NAANS, isCheeseNaan, lunchSlot, parisServiceClock, lunchOpenNow } = require('../cheese-naans');
const { slotsForDate, serviceClosureReason } = require('./availability');
// Off by default throughout preparation. Stock management never enables this.
const naansPublished = () => process.env.CHEESE_NAANS_PUBLISHED === 'true';
function naanAvailability(id, stock, now, database = {}) {
  if (!isCheeseNaan(id)) return {};
  const published = naansPublished(), date = parisServiceClock(now).date;
  const slots = [...new Set(['pickup', 'delivery'].flatMap(method => slotsForDate(date, method, database, 20).filter(slot => !serviceClosureReason(date, slot, method, database, 20))))];
  const inServiceWindow = lunchOpenNow(now, slots);
  const visible = published && inServiceWindow;
  return { menuPrice: CHEESE_NAANS[id].menuPrice, description: CHEESE_NAANS[id].description, lunchOnly: true, published, inServiceWindow, visible,
    available: stock.available && visible,
    availabilityState: !stock.enabled ? 'out_of_stock' : !published ? 'unpublished' : !inServiceWindow ? 'outside_service' : 'available',
    reason: !stock.available ? stock.reason : !published ? 'En préparation · non publié.' : !inServiceWindow ? 'Disponible uniquement pendant le service du midi.' : '' };
}
function assertNaanService(id, context) {
  if (!isCheeseNaan(id)) return;
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!naansPublished()) fail('Les cheese naans ne sont pas encore publiés.');
  if (!lunchSlot(context?.slot)) fail('Les cheese naans sont proposés uniquement pour le service du midi.');
}
module.exports = { naanAvailability, assertNaanService, naansPublished };
