# Prénom et nom obligatoires — 24 septembre 2026

## Correction

- Le nouveau client demande `registrationVersion: 2` après vérification SMS. Le serveur fournit une preuve privée valable 15 minutes, sans créer de fiche client ni offrir la remise avant la saisie des deux noms.
- `POST /api/auth/sms/register` valide séparément `firstName` et `lastName`, normalise espaces/accents, puis crée le compte et son nom affichable. La preuve est liée au numéro vérifié, à usage idempotent, bornée en mémoire, et ne permet aucun accès aux routes clients. Un redémarrage nécessite de recommencer la vérification SMS.
- Un compte existant sans deux champs valides doit compléter son identité sur le nouveau client. Pas de migration inventant/séparant les noms existants ; aucun changement des points/commandes. Confidentialité, suppression et récupération de paiement restent accessibles.
- Modification du prénom/nom depuis les coordonnées de commande ; nom combiné conservé pour le tableau restaurant et les consommateurs historiques.
- Le serveur refuse les mises à jour vidant le nom et ferme l’ancienne création directe `/api/customers` sans preuve SMS, non utilisée par les clients actuels.

## Compatibilité Android importante

Android 1.0.0 (4) est déjà envoyé à Google pour examen : NE PAS remplacer cette version ni déclencher un nouveau build pour cette correction.
Le contrat SMS historique sans `registrationVersion` reste opérationnel pour cette version : elle peut encore créer un compte sans nom jusqu’à sa prochaine mise à jour. La saisie obligatoire concerne immédiatement le web mis à jour, et le code source des prochaines versions natives. Il faudra une nouvelle version Android/iOS pour y rendre cette étape obligatoire aussi, puis envisager le retrait du contrat historique après migration.
L’accès de revue isolé reste inchangé et exempt de l’étape réelle, sans données ou paiements clients.

## Vérification

- 225 tests automatisés réussis, dont inscription incomplète, preuve invalide/expirée, non-duplication, numéro infalsifiable, suppression puis rejeu refusé, noms Unicode, patrimoine client conservé et compatibilité SMS ancienne version.
- Export web réussi, Docker inclut la validation partagée.
- Test visuel local à 390 × 844 : bouton désactivé avec un seul champ, création complète puis anniversaire facultatif ; ancien compte vide complété et 700 points conservés. SMS entièrement simulés, aucune écriture sur les clients réels.
- Mise en ligne confirmée : commit `13eab8e` poussé sur `main` ; API publique `/api/health` annonce ce commit et `customerIdentity: 2`. Le site public charge `AppEntry-4c35195234eb643e916a3ca6f30f6f99.js`, identique à l’export local testé. Aucune connexion client ni aucun SMS réel utilisé pour contrôler la production.
