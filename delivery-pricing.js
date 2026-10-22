'use strict';
// Shared approved road-distance tiers. The server remains authoritative.
const DELIVERY_PRICING = Object.freeze([
  Object.freeze({ maxKm: 1.5, label: '0 à 1,5 km', price: 3.99 }),
  Object.freeze({ maxKm: 3, label: '1,5 à 3 km', price: 4.99 }),
  Object.freeze({ maxKm: 5, label: '3 à 5 km', price: 5.99 }),
  Object.freeze({ maxKm: 7, label: '5 à 7 km', price: 6.99 }),
]);
const DELIVERY_MAX_KM = 7;
const DELIVERY_FEE_CENTS = Object.freeze(DELIVERY_PRICING.map(tier => Math.round(tier.price * 100)));
function deliveryFeeForDistance(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return DELIVERY_PRICING.find(tier => distanceKm <= tier.maxKm)?.price ?? null;
}
module.exports = { DELIVERY_PRICING, DELIVERY_MAX_KM, DELIVERY_FEE_CENTS, deliveryFeeForDistance };
