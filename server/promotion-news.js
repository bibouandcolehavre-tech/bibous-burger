const promotions = require('./merchant-promotions');

// A published, time-limited announcement, not a new promotion. It must never
// advertise a paused, expired, exhausted or differently configured offer.
const campaign = {
  code: 'QUATREBURGER',
  startsAt: '2026-10-08T22:00:00.000Z',
  endsAt: '2026-10-09T22:00:00.000Z',
  title: 'Le 4e offert !',
  subtitle: 'QUATREBURGER · 23 h 59 ce soir\n4 burgers seuls : le moins cher offert. Hors suppléments. Non cumulable avec les −10 % de bienvenue.',
};

function promotionNews(database, now, items) {
  const timestamp = now.getTime();
  if (timestamp < Date.parse(campaign.startsAt) || timestamp >= Date.parse(campaign.endsAt)) return items;
  let offer;
  try {
    offer = promotions.findByCode(database, campaign.code, timestamp);
    if (!offer || offer.type !== 'buy3_get1_burger' || offer.combineWelcome !== false || offer.minimum !== 0 ||
        offer.endsAt !== campaign.endsAt || offer.oncePerCustomer || offer.ownerCustomerId || offer.sourceWheelSpinId) return items;
    promotions.assertAvailable(database, offer, null, timestamp);
  } catch { return items; }

  // Installed clients keep the initially selected card ID. Android initially
  // selects "epicu"; web selects "contest". Reuse the Android headline slot and
  // temporarily rename the preserved editorial cards so both existing clients
  // land on the announcement, without a binary update or deleting any news.
  const usedIds = new Set(items.map(item => item.id));
  const preserved = items.map(item => {
    if (!['epicu', 'contest'].includes(item.id)) return item;
    let id = `${item.id}-editorial`;
    while (usedIds.has(id)) id += '-news';
    usedIds.add(id);
    return { ...item, id };
  });
  return [{ id: 'epicu', kind: 'note', enabled: true, title: campaign.title,
    subtitle: campaign.subtitle, url: '', imageUrl: '' }, ...preserved];
}

module.exports = { promotionNews };
