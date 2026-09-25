const paymentError = (message = "La vérification SumUp est momentanément indisponible. Réessaie sans effectuer un nouveau paiement.") => Object.assign(new Error(message), { statusCode: 502 });
const cents = value => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;

// Only use checkout data fetched from the authenticated SumUp API, never a
// payment status supplied by a browser or the incoming webhook.
const applyVerifiedCheckout = (record, checkout, merchantCode, value = new Date()) => {
  const payment = record.payment;
  const amount = record.paidTotal ?? record.total ?? record.amount;
  if (!payment || !checkout?.id || (payment.checkoutId && checkout.id !== payment.checkoutId)
    || checkout.checkout_reference !== payment.checkoutReference
    || cents(checkout.amount) === null || cents(checkout.amount) !== cents(amount)
    || checkout.currency !== "EUR" || !merchantCode || checkout.merchant_code !== merchantCode
    || !["PENDING", "FAILED", "PAID", "EXPIRED"].includes(checkout.status)) {
    throw paymentError("Les informations du paiement ne correspondent pas. Contacte le restaurant avant de payer à nouveau.");
  }
  payment.checkoutId = checkout.id;
  payment.merchantCode = merchantCode;
  payment.updatedAt = value.toISOString();
  if (payment.status !== "PAID") payment.status = checkout.status;
  if (payment.status === "PAID") payment.paidAt ||= value.toISOString();
  const url = checkout.hosted_checkout_url;
  if (typeof url === "string") {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && parsed.hostname === "checkout.sumup.com" && !parsed.username && !parsed.password) payment.checkoutUrl = url;
    } catch { /* Missing URL never changes the verified payment result. */ }
  }
  return payment;
};
const assertOrderTransition = (order, status) => {
  const u = order.uberDirect;
  if (u && ["sending", "uncertain", "created"].includes(u.phase) && !["canceled", "returned", "delivered"].includes(u.status) && ["cancelled", "confirmed", "out_for_delivery", "delivered"].includes(status)) throw Object.assign(new Error("Livraison confiée à Uber : actualisez son suivi. Pour annuler, annulez d’abord la course dans Uber Direct."), {statusCode:409});
  if (order.status === "awaiting_customer" && status !== "cancelled") throw Object.assign(new Error("Le client doit revalider le panier avant toute préparation."), { statusCode: 409 });
  if (order.status === "cancelled" && status !== "cancelled") throw Object.assign(new Error("Une commande annulée ne peut pas être réactivée."), { statusCode: 409 });
};
module.exports = { applyVerifiedCheckout, assertOrderTransition, paymentError };
