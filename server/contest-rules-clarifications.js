// Owner-approved clarifications of the already published calculation and carts.
// Pure presentation: preserve the stored regulation, revision, dates and scores.
const RULES_CLARIFICATION_VERSION = '2026-10-15-1';
const replacements = Object.freeze([
  ['Les suppléments et les frais de livraison éventuels restent à payer ; la livraison demeure soumise aux zones et créneaux du restaurant.',
    'Les menus offerts sont sans suppléments payants : il faut retirer ces suppléments de la commande utilisant le code. Les frais de livraison éventuels restent à payer ; la livraison demeure soumise aux zones et créneaux du restaurant.'],
  ['Les suppléments et frais de livraison éventuels restent à payer.',
    'Le menu offert est sans suppléments payants : il faut retirer ces suppléments de la commande utilisant le code. Les frais de livraison éventuels restent à payer.'],
  ['Seuls les points gagnés entre le 15 octobre à 11 h et la clôture du 31 décembre sont retenus, une fois le client inscrit au concours ; les gains antérieurs et futurs sont exclus.',
    'Après son inscription au concours, le client retrouve les points de roue valides gagnés pendant la période du concours, y compris ceux gagnés avant son inscription mais après l’ouverture du 15 octobre à 11 h. Les gains antérieurs à l’ouverture et ceux postérieurs à la clôture du 31 décembre sont exclus.'],
  ['Les commandes réellement payées pendant la période du concours rapportent 1 point par euro effectivement payé et conservé.',
    'Les commandes réellement payées pendant la période du concours rapportent 1 point par euro effectivement payé et conservé. Après inscription, les commandes éligibles payées depuis l’ouverture sont prises en compte, même si elles précèdent l’inscription au concours.'],
]);
function clarifyContestRules(rules) {
  let result = typeof rules === 'string' ? rules : '';
  for (const [previous, current] of replacements) {
    // Idempotent when the prepared form already contains the clarified wording.
    if (!result.includes(current)) result = result.split(previous).join(current);
  }
  return result;
}
module.exports = { clarifyContestRules, RULES_CLARIFICATION_VERSION };
