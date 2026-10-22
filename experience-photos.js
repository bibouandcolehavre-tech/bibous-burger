// Owner-approved pictures, shared by standard recipes and Compose ton burger.
const crudites = {
  roquette: require('./assets/experience/ingredients/roquette.png'),
  tomate: require('./assets/experience/ingredients/tomates-cerises.png'),
  oignons: require('./assets/experience/ingredients/oignons-caramelises.png'),
  oignon: require('./assets/experience/ingredients/oignons-caramelises.png'),
  cornichons: require('./assets/experience/ingredients/cornichons.png'),
  concombre: require('./assets/experience/ingredients/concombre.png'),
  'chou-rouge': require('./assets/experience/ingredients/chou-rouge.png'),
  'salade-thai': require('./assets/experience/ingredients/salade-thai.png'),
};
const proteins = {
  boeuf: require('./assets/supplements/steak-hache-cuit.png'),
  poulet: require('./assets/experience/ingredients/two-tenders-white-plate.png'),
  canard: require('./assets/experience/ingredients/canard-effiloche-white.png'),
  agneau: require('./assets/experience/ingredients/agneau-effiloche-white.png'),
  pork: require('./assets/experience/ingredients/porc-effiloche-white.png'),
  galette: require('./assets/supplements/rosti-pomme-de-terre.png'),
};
const recipeProtein = { classique: 'boeuf', montagnes: 'boeuf', 'gros-lard': 'boeuf', basilic: 'boeuf', dynamite: 'poulet', duck: 'canard', atlas: 'agneau', pork: 'pork' };
function experiencePhoto(group, id, productId = '') {
  if (['salad', 'custom-crudite', 'crudites'].includes(group)) return crudites[id] || null;
  if (['custom-protein', 'custom-extra'].includes(group)) return proteins[id.replace(/^extra-/, '')] || null;
  if (group === 'protein') return ['vegetarian', 'galette-base', 'galette'].includes(id) ? proteins.galette : proteins[recipeProtein[productId.replace(/-menu$/, '')]] || null;
  return null;
}
module.exports = { experiencePhoto, crudites, proteins };
