'use strict';
const POINTS = 20;
const VERSION = 'verified-invitee-20-v1';
const RULES = "AVENANT — PARRAINAGE : 20 POINTS CHACUN\nLe parrain conserve ses 20 points au classement pour chaque nouvel ami admissible. Ce nouvel ami reçoit aussi 20 points au classement, une seule fois, lorsqu’il crée son compte pendant le concours, vérifie son numéro par SMS puis s’inscrit au concours avec le code d’un parrain participant valide. Ce bonus du filleul s’applique également aux parrainages admissibles déjà enregistrés depuis l’ouverture : pour ces inscriptions antérieures, il est crédité à la publication de cet avenant, sans antidater le moment où le nouveau score est atteint. Les points déjà acquis sont conservés. Le nombre de nouveaux amis parrainés n’est pas limité par jour ; le bonus d’inscription du filleul reste unique, avec un seul parrain par compte et numéro vérifié. Anciens comptes, auto-parrainages, participations retirées et parrainages invalides n’ouvrent pas droit à ce bonus. Envoyer un lien ou choisir un contact ne crédite pas ces 20 points. Le point quotidien d’appui sur Partager reste distinct. Il s’agit de points du classement du concours, pas de points de fidélité utilisables pour des récompenses. Aucun achat n’est obligatoire. Les dates, lots et autres règles restent inchangés.";
function enabled(contest) {
  const bonus = contest?.referralInviteeBonus;
  return contest?.status === 'published' && bonus?.version === VERSION && bonus.points === POINTS &&
    bonus.includeExisting === true && Number.isFinite(Date.parse(bonus.publishedAt));
}
function awardedAt(contest, entry) {
  if (!enabled(contest) || !Number.isFinite(Date.parse(entry?.joinedAt))) return null;
  return new Date(Math.max(Date.parse(entry.joinedAt), Date.parse(contest.referralInviteeBonus.publishedAt))).toISOString();
}
module.exports = { POINTS, VERSION, RULES, enabled, awardedAt };
