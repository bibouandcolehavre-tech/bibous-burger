const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REFERRAL_BONUS_POINTS,
  applyReferralCode,
  ensureAllReferralCodes,
  grantReferralReward,
  revokeReferralReward
} = require("./referrals");

const databaseFixture = () => ({
  customers: [
    { id: "sponsor", name: "Parrain", points: 25 },
    { id: "friend", name: "Filleul", points: 0 }
  ],
  orders: []
});

test("attribue un code personnel unique à chaque client", () => {
  const database = databaseFixture();
  assert.equal(ensureAllReferralCodes(database), true);
  assert.match(database.customers[0].referralCode, /^BIBOU-[A-F0-9]{6}$/);
  assert.match(database.customers[1].referralCode, /^BIBOU-[A-F0-9]{6}$/);
  assert.notEqual(database.customers[0].referralCode, database.customers[1].referralCode);
  assert.equal(ensureAllReferralCodes(database), false);
});

test("refuse l’auto-parrainage et les codes inconnus", () => {
  const database = databaseFixture();
  ensureAllReferralCodes(database);
  assert.throws(() => applyReferralCode(database, database.customers[0], database.customers[0].referralCode), /propre code/);
  assert.throws(() => applyReferralCode(database, database.customers[1], "BIBOU-INCONNU"), /n’existe pas/);
});

test("crédite 100 points une seule fois après la première commande payée", () => {
  const database = databaseFixture();
  ensureAllReferralCodes(database);
  const [sponsor, friend] = database.customers;
  applyReferralCode(database, friend, sponsor.referralCode, new Date("2026-09-17T10:00:00Z"));
  const order = { id: "order-1", number: 1, customerId: friend.id, status: "confirmed", createdAt: "2026-09-17T10:05:00Z", payment: { status: "PAID", paidAt: "2026-09-17T10:06:00Z" } };
  database.orders.push(order);

  const firstGrant = grantReferralReward(order, database, new Date("2026-09-17T10:06:00Z"));
  assert.equal(firstGrant.pointsAdded, REFERRAL_BONUS_POINTS);
  assert.equal(sponsor.points, 125);
  assert.equal(grantReferralReward(order, database).pointsAdded, 0);
  assert.equal(sponsor.points, 125);
});

test("retire le bonus si la commande est annulée puis autorise la prochaine vraie première commande", () => {
  const database = databaseFixture();
  ensureAllReferralCodes(database);
  const [sponsor, friend] = database.customers;
  applyReferralCode(database, friend, sponsor.referralCode);
  const cancelledOrder = { id: "order-1", number: 1, customerId: friend.id, status: "confirmed", createdAt: "2026-09-17T10:00:00Z", payment: { status: "PAID", paidAt: "2026-09-17T10:01:00Z" } };
  database.orders.push(cancelledOrder);
  grantReferralReward(cancelledOrder, database);

  cancelledOrder.status = "cancelled";
  assert.equal(revokeReferralReward(cancelledOrder, database), true);
  assert.equal(sponsor.points, 25);

  const nextOrder = { id: "order-2", number: 2, customerId: friend.id, status: "confirmed", createdAt: "2026-09-18T10:00:00Z", payment: { status: "PAID", paidAt: "2026-09-18T10:01:00Z" } };
  database.orders.push(nextOrder);
  assert.equal(grantReferralReward(nextOrder, database).pointsAdded, REFERRAL_BONUS_POINTS);
  assert.equal(sponsor.points, 125);
});

test('commande offerte : aucun bonus parrainage, première commande bancaire toujours éligible', () => {
  const database = databaseFixture();
  ensureAllReferralCodes(database);
  const [sponsor, friend] = database.customers;
  const gift = { id: 'gift', customerId: friend.id, status: 'confirmed', payment: { status: 'PAID', provider: 'promotion', paidAt: '2026-09-26T10:00:00Z' } };
  database.orders.push(gift);
  applyReferralCode(database, friend, sponsor.referralCode);
  assert.equal(grantReferralReward(gift, database).pointsAdded, 0);
  assert.equal(sponsor.points, 25);
  const paid = { ...gift, id: 'paid', payment: { status: 'PAID', provider: 'sumup', paidAt: '2026-09-26T11:00:00Z' } };
  database.orders.push(paid);
  assert.equal(grantReferralReward(paid, database).pointsAdded, 100);
  assert.equal(sponsor.points, 125);
});
