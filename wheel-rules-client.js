const { GAME_ORGANIZER_NOTICE } = require('./game-organizer-notice');
const prizeLabels = {
  none: 'aucun gain',
  'points-20': '20 points Club Bibou',
  'points-30': '30 points Club Bibou',
  'points-40': '40 points Club Bibou',
  'points-60': '60 points Club Bibou',
  drink: 'une boisson offerte',
  fries: 'des frites maison offertes',
  dessert: 'un dessert offert',
  classic: 'le burger Classique seul du mois',
  'discount-1': 'une remise de 1 %',
  'discount-2': 'une remise de 2 %',
  'discount-5': 'une remise de 5 %',
  'stb-tickets': 'un lot de deux places STB',
};
const tierLabels = {
  small: 'Commande de 15 € à moins de 30 € (et tours de parrainage ou de test)',
  medium: 'Commande de 30 € à moins de 60 €',
  large: 'Commande de 60 € ou plus',
};

function fullWheelRules(rules, segments) {
  if (!rules) return null;
  const notice = `\n\n${GAME_ORGANIZER_NOTICE}`;
  if (!segments || !Object.keys(tierLabels).every(tier => Array.isArray(segments[tier]))) return rules + notice;
  const odds = Object.entries(tierLabels).map(([tier, heading]) => {
    const rewards = segments[tier].map(([id, chance]) => `${prizeLabels[id] || id} : ${chance} %`);
    return `${heading} : ${rewards.join(' ; ')}.`;
  });
  return `${rules}\n\nProbabilités de chaque résultat par tour pour les nouvelles commandes :\n${odds.join('\n')}\nLes cadeaux ou remises déjà détenus peuvent être remplacés par les points du palier, selon les conditions ci-dessus ; ils ne deviennent pas des résultats sans gain.${notice}`;
}

module.exports = { fullWheelRules };
