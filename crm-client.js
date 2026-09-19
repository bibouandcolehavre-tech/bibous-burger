// Display estimate only. The server chooses the discount again at checkout.
function bestClientOffer(offers, subtotal, baseRate, now = Date.now()) {
  return (offers || []).filter(o => o.status === 'available' && o.expiresAt > now && subtotal >= o.minSubtotal && o.discountPercent / 100 > baseRate)
    .sort((a,b) => b.discountPercent - a.discountPercent || a.expiresAt - b.expiresAt)[0] || null;
}
module.exports = { bestClientOffer };
