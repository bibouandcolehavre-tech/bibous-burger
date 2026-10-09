const test = require('node:test');
const assert = require('node:assert/strict');
const { publicNews, dashboardNews } = require('./news');
const { DEFAULT_NEWS } = require('../news-config');
const { regularSlotsForDate } = require('./availability');

const now = new Date('2026-10-09T16:00:00.000Z');
const offer = () => ({ id: '00000000-0000-4000-8000-000000000001', code: 'QUATREBURGER',
  type: 'buy3_get1_burger', enabled: true, combineWelcome: false, minimum: 0,
  startsAt: null, endsAt: '2026-10-09T22:00:00.000Z', usageLimit: null, oncePerCustomer: false });
const fixture = () => ({ merchantPromotions: [offer()], orders: [], customers: [],
  news: { revision: 7, items: DEFAULT_NEWS.map(item => ({ ...item })) } });

test('QUATREBURGER : annonce lisible, compatible Android/web existants, actualités et données conservées', () => {
  const db = fixture(), before = JSON.stringify(db);
  const { items } = publicNews(db, now);
  const headline = items[0];
  assert.equal(headline.kind, 'note');
  assert.equal(headline.title, 'Le 4e offert !');
  assert.match(headline.subtitle, /QUATREBURGER/);
  assert.match(headline.subtitle, /23 h 59 ce soir/);
  assert.match(headline.subtitle, /4 burgers seuls : le moins cher offert/);
  assert.match(headline.subtitle, /Hors suppléments/);
  assert.match(headline.subtitle, /Non cumulable avec les −10 % de bienvenue/);
  assert.ok(headline.subtitle.length <= 160);
  assert.equal(headline.url, '');
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  for (const original of DEFAULT_NEWS) {
    const preserved = items.find(item => item.title === original.title);
    assert.deepEqual({ ...preserved, id: original.id }, original);
  }
  // Model the selection algorithm already shipped in NewsCarousel.js.
  for (const platform of ['web', 'android']) {
    const visible = items.filter(item => platform !== 'android' || item.kind !== 'contest');
    const selectedId = DEFAULT_NEWS.find(item => platform !== 'android' || item.kind !== 'contest').id;
    assert.equal(visible[Math.max(0, visible.findIndex(item => item.id === selectedId))].id, headline.id);
  }
  assert.equal(JSON.stringify(db), before, 'la consultation ne modifie ni les actualités, ni les promotions, ni le concours');
  assert.deepEqual(dashboardNews(db), db.news);
});

test('L’annonce disparaît exactement à minuit Paris et les identifiants éditoriaux sont restaurés', () => {
  const db = fixture();
  assert.match(publicNews(db, new Date('2026-10-09T21:59:59.999Z')).items[0].subtitle, /QUATREBURGER/);
  for (const date of ['2026-10-08T21:59:59.999Z', '2026-10-09T22:00:00.000Z', '2026-10-10T18:00:00.000Z']) {
    assert.deepEqual(publicNews(db, new Date(date)).items, DEFAULT_NEWS);
  }
});

test('Pas de publicité pour une offre absente, arrêtée, changée, future, limitée ou épuisée', () => {
  for (const patch of [null, { enabled: false }, { type: 'percent_order' }, { combineWelcome: true },
    { minimum: 50 }, { endsAt: '2026-10-10T22:00:00.000Z' }, { startsAt: '2026-10-09T18:00:00.000Z' },
    { oncePerCustomer: true }, { ownerCustomerId: 'fictif' }, { sourceWheelSpinId: 'fictif' }]) {
    const db = fixture();
    db.merchantPromotions = patch === null ? [] : [{ ...offer(), ...patch }];
    assert.deepEqual(publicNews(db, now).items, DEFAULT_NEWS);
  }
  const db = fixture();
  db.merchantPromotions[0].usageLimit = 1;
  db.orders.push({ promotion: offer(), payment: { status: 'PAID' } });
  assert.deepEqual(publicNews(db, now).items, DEFAULT_NEWS);
});

test('Une fermeture exceptionnelle reste prioritaire, sans promouvoir des commandes impossibles', () => {
  const db = fixture(), date = '2026-10-09';
  db.serviceSchedule = { dates: { [date]: { services: Object.fromEntries(
    ['pickup', 'delivery', 'reservation'].map(method => [method, Object.fromEntries(
      regularSlotsForDate(date, method).filter(slot => slot >= '18:00').map(slot => [slot, false])
    )])
  ) } } };
  const { items } = publicNews(db, now);
  assert.match(items[0].title, /Fermé exceptionnellement/);
  assert.equal(items.some(item => item.subtitle?.includes('QUATREBURGER')), false);
});

test('Le concours reste fermé et les identifiants d’annonces personnalisées ne se heurtent pas', () => {
  const db = fixture();
  db.news.items.push({ id: 'epicu-editorial', kind: 'note', title: 'Autre actualité', enabled: true });
  const { items } = publicNews(db, now);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.match(items.find(item => item.kind === 'contest').title, /se prépare/);
  assert.equal(db.referralContest, undefined);
  assert.match(publicNews(db, now, false).items[0].subtitle, /QUATREBURGER/);
});
