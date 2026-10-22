// Presentation only: the server remains the sole authority for available turns
// and rewards. Never use a displayed estimate to authorize a spin.
const count = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
const cents = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * 100)) : 0;
const remainingLabel = value => `${count(value)} tour${count(value) > 1 ? 's' : ''} restant${count(value) > 1 ? 's' : ''}`;

function paidOrderTurnCount(order) {
  if (!order || order.payment?.status !== 'PAID' || ['cash', 'promotion'].includes(order.payment.provider) ||
      order.status === 'cancelled' || order.refund?.status === 'due') return 0;
  const products = Math.max(0, cents(order.subtotal) - cents(order.discount));
  const refunded = order.refund?.status === 'recorded' ? cents(order.refund.amount) : 0;
  const retained = Math.max(0, cents(order.paidTotal ?? order.total) - refunded);
  // Old paid orders keep their recorded legacy rate. This changes no rights.
  const rate = Number(order.wheelEurosPerTurn) === 15 ? 15 : 10;
  return Math.floor(Math.min(products, retained) / (rate * 100));
}

function wheelPresentation(state, order, accountMode = false) {
  const available = count(state?.available);
  const orders = Array.isArray(state?.orderTurns) ? state.orderTurns.filter(item => item?.orderId && count(item.available)) : [];
  const currentOrder = order?.id ? orders.find(item => item.orderId === order.id) : null;
  const source = currentOrder || orders[0] || null;
  const fromReferrals = Math.min(available, count(state?.availableFromReferrals));
  // The total is account-wide, not just the first order's remaining turns.
  // Select one eligible source per request while showing the complete balance.
  const fromOrders = Math.min(available - fromReferrals, orders.reduce((sum, item) => sum + count(item.available), 0));
  const canRequest = available > 0 && Boolean(source || fromReferrals);
  const unlocked = !accountMode && state?.status === 'active' ? paidOrderTurnCount(order) : 0;
  return {
    available, remainingText: remainingLabel(available), source,
    fromOrders, fromReferrals, canRequest,
    currentOrderRemaining: Math.min(available, count(currentOrder?.available)),
    orderUnlockedText: unlocked ? `Ta commande te permet de déverrouiller ${unlocked} tour${unlocked === 1 ? '' : 's'} de roue.` : '',
    completedText: 'Tous tes tours ont été joués.',
  };
}

function wheelDiameter(cardWidth) {
  if (!Number.isFinite(cardWidth) || cardWidth <= 0) return 0;
  return Math.max(0, Math.min(360, Math.floor(cardWidth - 36)));
}

function wheelPrizeHint(prize) {
  if (prize?.prizeId === 'classic') return 'Ajoute un burger Classique seul, sauce et crudités au choix, sans supplément payant. Le code offre un seul Classique, sans minimum supplémentaire de produits. Les autres articles et frais de livraison restent à payer.';
  if (prize?.prizeId === 'dessert') return 'Ajoute un dessert de la carte à ta prochaine commande d’au moins 10 € de produits : un seul dessert sera offert.';
  if (prize?.prizeId === 'drink') return 'Ajoute la boisson à ta prochaine commande d’au moins 10 € de produits pour utiliser ce cadeau.';
  if (prize?.prizeId === 'fries') return 'Ajoute les frites maison à ta prochaine commande d’au moins 10 € de produits pour utiliser ce cadeau.';
  return 'À utiliser sur une prochaine commande d’au moins 10 € de produits.';
}
module.exports = { paidOrderTurnCount, remainingLabel, wheelPresentation, wheelDiameter, wheelPrizeHint };
