const { withdrawContest } = require('./referral-contest');
const { deleteCustomerPush } = require('./push-notifications');
const { deleteCustomer: deleteCustomerCrm } = require('./crm');
const anonymizeCustomerAccount = (database, customer, value = new Date()) => {
  if (!database || !customer) return null;
  const deletedAt = value.toISOString();
  withdrawContest(database, customer, value);
  deleteCustomerPush(database, customer.id);
  deleteCustomerCrm(database, customer.id);
  const customerId = customer.id;
  const customerPhone = customer.phone;
  let ordersAnonymized = 0;
  let reservationsAnonymized = 0;
  let rewardClaimsAnonymized = 0;

  (database.orders || []).forEach((order) => {
    if (order.customerId !== customerId) return;
    order.customerId = null;
    order.customerName = "Client supprimé";
    delete order.customerPhone;
    delete order.deliveryAddress;
    order.comment = "";
    if (order.uberDirect) delete order.uberDirect.payload;
    for (const amendment of [order.amendment, ...(order.amendmentHistory || [])]) {
      if (amendment?.proposal) amendment.proposal.reason = "Motif effacé après suppression du compte";
    }
    order.accountDeletedAt = deletedAt;
    delete order.referralSponsorCustomerId;
    ordersAnonymized += 1;
  });

  (database.reservations || []).forEach((reservation) => {
    if (reservation.customerId !== customerId && reservation.phone !== customerPhone) return;
    reservation.customerId = null;
    reservation.customerName = "Client supprimé";
    reservation.phone = "";
    reservation.note = "";
    if (reservation.status !== "cancelled") reservation.status = "cancelled";
    reservation.accountDeletedAt = deletedAt;
    reservation.updatedAt = deletedAt;
    reservationsAnonymized += 1;
  });

  (database.bibouPlusPurchases || []).forEach((purchase) => {
    if (purchase.customerId === customerId) {
      purchase.customerId = null;
      purchase.accountDeletedAt = deletedAt;
    }
  });

  (database.rewardClaims || []).forEach((claim) => {
    if (claim.customerId !== customerId) return;
    claim.customerId = null;
    claim.customerName = "Client supprimé";
    if (claim.status === "active") claim.status = "cancelled";
    claim.accountDeletedAt = deletedAt;
    rewardClaimsAnonymized += 1;
  });

  (database.customers || []).forEach((otherCustomer) => {
    if (otherCustomer.referredByCustomerId === customerId) delete otherCustomer.referredByCustomerId;
  });
  database.customers = (database.customers || []).filter((item) => item.id !== customerId);

  return { customerId, deletedAt, ordersAnonymized, reservationsAnonymized, rewardClaimsAnonymized };
};

module.exports = { anonymizeCustomerAccount };
