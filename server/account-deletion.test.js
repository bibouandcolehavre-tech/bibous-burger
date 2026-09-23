const test = require("node:test");
const assert = require("node:assert/strict");
const { anonymizeCustomerAccount } = require("./account-deletion");

test("supprime le compte et anonymise les données opérationnelles", () => {
  const customer = { id: "customer-1", name: "Camille", phone: "+33600000000" };
  const database = {
    customers: [customer, { id: "customer-2", referredByCustomerId: customer.id }],
    orders: [{ id: "order-1", customerId: customer.id, customerName: "Camille", customerPhone: "+33600000000", deliveryAddress: { address: "1 rue fictive", postalCode: "76600", city: "Le Havre" }, comment: "Sonnez à l'interphone Camille", referralSponsorCustomerId: customer.id }],
    reservations: [{ id: "reservation-1", customerId: customer.id, customerName: "Camille", phone: customer.phone, note: "Anniversaire", status: "confirmed" }],
    bibouPlusPurchases: [{ id: "plus-1", customerId: customer.id }],
    rewardClaims: [{ id: "reward-1", customerId: customer.id, customerName: "Camille", status: "active" }],
  };

  const result = anonymizeCustomerAccount(database, customer, new Date("2026-09-18T10:00:00.000Z"));

  assert.equal(result.ordersAnonymized, 1);
  assert.equal(result.reservationsAnonymized, 1);
  assert.equal(database.customers.length, 1);
  assert.equal(database.customers[0].referredByCustomerId, undefined);
  assert.equal(database.orders[0].customerId, null);
  assert.equal(database.orders[0].customerName, "Client supprimé");
  assert.equal(database.orders[0].customerPhone, undefined);
  assert.equal(database.orders[0].deliveryAddress, undefined);
  assert.equal(database.orders[0].comment, "");
  assert.equal(database.reservations[0].phone, "");
  assert.equal(database.reservations[0].note, "");
  assert.equal(database.reservations[0].status, "cancelled");
  assert.equal(database.bibouPlusPurchases[0].customerId, null);
  assert.equal(database.rewardClaims[0].customerId, null);
  assert.equal(database.rewardClaims[0].customerName, "Client supprimé");
  assert.equal(database.rewardClaims[0].status, "cancelled");
  assert.equal(result.rewardClaimsAnonymized, 1);
});
