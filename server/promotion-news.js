const promotions = require('./merchant-promotions');

// A published, time-limited announcement, not a new promotion. It must never
// advertise a paused, expired, exhausted or differently configured offer.
const campaign = {
  code: 'QUATREBURGER',
  startsAt: '2026-10-08T22:00:00.000Z',
  endsAt: '2026-10-10T20:00:00.000Z',
  activeWindows: [
    { startsAt: '2026-10-08T22:00:00.000Z', endsAt: '2026-10-09T22:00:00.000Z' },
    { startsAt: '2026-10-10T17:00:00.000Z', endsAt: '2026-10-10T20:00:00.000Z' },
  ],
  title: 'Le 4e offert !',
  subtitle: 'QUATREBURGER · 23 h 59 ce soir\n4 burgers seuls : le moins cher offert. Hors suppléments. Non cumulable avec les −10 % de bienvenue.',
  extendedSubtitle: 'QUATREBURGER · ce soir + samedi 19–22 h\n4 burgers seuls : le moins cher offert. Hors suppléments. Non cumulable avec la bienvenue.',
  saturdaySubtitle: 'QUATREBURGER · Ce soir de 19 h à 22 h\n4 burgers seuls : le moins cher offert. Hors suppléments. Non cumulable avec la bienvenue.',
};

function promotionNews(database, now, items) {
  const timestamp = now.getTime();
  if (timestamp < Date.parse(campaign.startsAt) || timestamp >= Date.parse(campaign.endsAt)) return items;
  const activeWindow = campaign.activeWindows.find(window => Date.parse(window.startsAt) <= timestamp && timestamp < Date.parse(window.endsAt));
  if (!activeWindow) return items;
  let offer;
  let extended;
  try {
    offer = promotions.findByCode(database, campaign.code, timestamp);
    if (!offer || offer.type !== 'buy3_get1_burger' || offer.combineWelcome !== false || offer.minimum !== 0 ||
        offer.oncePerCustomer || offer.ownerCustomerId || offer.sourceWheelSpinId) return items;
    extended = offer.endsAt === campaign.endsAt && JSON.stringify(offer.activeWindows) === JSON.stringify(campaign.activeWindows);
    const originalFriday = offer.endsAt === campaign.activeWindows[0].endsAt && !offer.activeWindows?.length;
    if (!extended && !originalFriday) return items;
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
    subtitle: !extended ? campaign.subtitle : activeWindow === campaign.activeWindows[0] ? campaign.extendedSubtitle : campaign.saturdaySubtitle,
    url: '', imageUrl: '' }, ...preserved];
}

module.exports = { promotionNews };
