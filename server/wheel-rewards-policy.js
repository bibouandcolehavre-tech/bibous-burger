// Versioned reward policy. Existing published settings keep their old rules
// until the merchant explicitly activates version 2 through the dashboard.
const { parisDateKey } = require('./availability');
const TIERS_V2 = Object.freeze({
  small: Object.freeze([['none', 20], ['points-20', 40], ['points-40', 25], ['points-60', 5], ['drink', 5], ['dessert', 3], ['discount-1', 2]]),
  medium: Object.freeze([['none', 20], ['points-30', 40], ['drink', 15], ['dessert', 10], ['discount-1', 8], ['discount-2', 5], ['discount-5', 2]]),
  large: Object.freeze([['none', 20], ['points-40', 40], ['drink', 15], ['dessert', 13], ['discount-1', 7], ['discount-2', 3], ['discount-5', 2]]),
});
const enabled = wheel => wheel?.rewardsVersion === 2;
const monthKey = now => parisDateKey(now).slice(0, 7);
const classicAvailable = (db, now = new Date()) => enabled(db.wheel) && db.wheel.monthlyClassicEnabled === true &&
  !(db.wheelClassicMonths || []).includes(monthKey(now)) &&
  !(db.wheelSpins || []).some(spin => spin.prizeId === 'classic' && spin.monthlyClassicMonth === monthKey(now));

function segments({ classic = false, stb = false } = {}) {
  return Object.fromEntries(Object.entries(TIERS_V2).map(([tier, source]) => {
    const extra = [['classic', classic], ['stb-tickets', stb]].filter(([, include]) => include).map(([id]) => [id, 1]);
    // The rare prizes replace winning points, never the 20% no-gain sector.
    return [tier, [...source.map(([id, chance]) => [id, id.startsWith('points-') ? chance - (id === source[1][0] ? extra.length : 0) : chance]), ...extra]];
  }));
}

function monthlyState(db, now = new Date(), eligible = true) {
  if (!enabled(db.wheel) || db.wheel.monthlyClassicEnabled !== true) return null;
  const available = eligible && classicAvailable(db, now);
  return { month: monthKey(now), available, maxWinners: 1, chancePercent: available ? 1 : 0,
    productId: 'classique', validDays: 30, immediate: true, guaranteedWinner: false };
}

function officialRules(wheel) {
  return `Roue Bibou, du ${wheel.startDate} au ${wheel.endDate} inclus, heure de Paris. Réservée aux clients possédant un compte Bibou. Après paiement confirmé, 1 tour par tranche complète de 15 € de produits effectivement payés, hors frais de livraison ; les tours acquis sous l’ancien barème restent conservés. Un tour supplémentaire est accordé par parrainage validé. Les commandes offertes, annulées ou remboursées ne donnent pas droit aux tours correspondants. Chaque tour a 80 % de chances de gagner et 20 % de chances de ne rien gagner, indépendamment du nombre de commandes ; cela ne garantit pas quatre commandes gagnantes sur cinq. Les probabilités de chaque gain et de chaque palier sont affichées ci-dessous. Les gains possibles sont des points Club Bibou, une boisson ou un dessert offert, ou une remise de 1 %, 2 % ou 5 % sur une prochaine commande. Les codes de ces gains sont personnels, à usage unique dans les 30 jours sur une prochaine commande d’au moins 10 € de produits ; ajoutez la boisson ou le dessert à cette commande. Un seul code promotionnel par commande ; les remises de la roue ne se cumulent pas entre elles et restent plafonnées à 5 %. Pour limiter les doublons de cadeaux et de remises encore utilisables, un gain déjà détenu peut être remplacé par des points Club Bibou du palier : il ne devient jamais un résultat sans gain. Les anciens gains et leurs conditions sont conservés. Les gains encore inutilisés liés à une commande annulée ou remboursée sont retirés.` +
    (wheel.monthlyClassicEnabled === true ? ' Bonus immédiat Classique : un seul burger Classique seul peut être gagné pour tout le restaurant et tous les supports réunis pendant chaque mois civil, heure de Paris, dans la période de la roue. Tant que ce lot n’a pas été attribué, chaque tour réel admissible a 1 % de chance de le gagner, pris dans la probabilité des points du palier : les 80 % de gains restent inchangés. Aucun rang de commande, ni première ni dixième commande, n’est requis. Après attribution, ce lot est retiré jusqu’au mois suivant et sa probabilité revient aux points du palier. Aucun tirage mensuel, rattrapage ou gagnant garanti : un mois peut rester sans gagnant. Le lot est attribué immédiatement au compte gagnant avec un code personnel, utilisable une seule fois dans les 30 jours : un burger Classique seul, sauce et crudités au choix, sans frites, boisson ni suppléments payants. Ajoutez le Classique seul au panier ; les autres produits et frais de livraison éventuels restent à payer. Aucun minimum supplémentaire de produits n’est imposé pour ce Classique. Les tours fictifs ou offerts de test sont exclus du lot mensuel. Une annulation, un remboursement ou une suppression du compte peut retirer le lot inutilisé, sans recréer un deuxième lot pour ce mois.' : '') +
    ' Le concours de classement reste distinct : ses dates, son règlement et le bonus éventuel des points réellement gagnés à la roue se consultent dans la rubrique du concours. Les cadeaux et remises ne donnent pas de points de classement. Apple et Google ne sont ni organisateurs ni sponsors.';
}

function activate(db, input, now = new Date()) {
  if (!input || Object.keys(input).some(key => !['rewardsVersion', 'monthlyClassicEnabled', 'confirmation'].includes(key)) ||
      input.rewardsVersion !== 2 || input.monthlyClassicEnabled !== true || input.confirmation !== 'ACTIVER LA ROUE 80')
    throw Object.assign(new Error('Confirmez les 80 % de gains et le Classique immédiat limité à un par mois pour tout le restaurant.'), { statusCode: 400 });
  if (db.wheel?.status !== 'published') throw Object.assign(new Error('La roue doit déjà être publiée. Son calendrier ne sera pas changé.'), { statusCode: 409 });
  if (enabled(db.wheel) && db.wheel.monthlyClassicEnabled === true) return false;
  db.wheel = { ...db.wheel, rewardsVersion: 2, monthlyClassicEnabled: true, rewardsPublishedAt: now.toISOString() };
  db.wheel.officialRules = officialRules(db.wheel);
  return true;
}

module.exports = { TIERS_V2, enabled, monthKey, classicAvailable, monthlyState, segments, officialRules, activate };
