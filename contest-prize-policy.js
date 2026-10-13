// Common copy and quotas for the two native apps and the authoritative API.
// Including these rules never publishes or finalizes a contest.
const CONTEST_PRIZE_PLANS = Object.freeze({
  1: { months: 12, menus: 2, singleOrder: false },
  2: { months: 6, menus: 1, singleOrder: false },
  3: { months: 1, menus: 2, singleOrder: true },
});
const CONTEST_PRIZE_RULES = 'Les lots sont utilisables uniquement en commandant dans l’application Bibou’s Burgers, connecté au compte gagnant, avec un code personnel et un créneau de retrait ou de livraison. Aucun bon ne peut être présenté directement au restaurant. Un nouveau code est créé chaque mois pour chaque gagnant : 2 menus par mois pendant 12 mois pour la 1re place, 1 menu par mois pendant 6 mois pour la 2e place ; la 3e place reçoit un code pour 2 menus en une seule commande. Les menus éligibles sont précisés avec le code, hors suppléments payants ; les frais de livraison éventuels restent à payer. Le code et le créneau de la commande doivent se situer dans le même mois civil, heure de Paris. Les menus non utilisés à la fin du mois sont perdus, sans report, échange contre de l’argent ni transfert à un autre compte. Avec l’accord du gagnant et selon les canaux disponibles, une notification ou un SMS annonce le code disponible ; un rappel est prévu dix jours avant le dernier jour du mois uniquement s’il reste des menus à utiliser. Le premier mois complet et les résultats définitifs sont confirmés par l’organisateur après la clôture.';
module.exports = { CONTEST_PRIZE_PLANS, CONTEST_PRIZE_RULES };
