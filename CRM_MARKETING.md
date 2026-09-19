# CRM restaurant — état de livraison

## Où le trouver

- Portail restaurant : **CRM & statistiques** (règles, ciblage, indicateurs, résultats et bons récents).
- Portail restaurant : **Paramètres** (activation globale, plafond quotidien, délai par client, heures Paris, état des canaux et déconnexion).
- Application client : étape facultative après la première validation SMS, puis **Mon compte → Mes offres** (jour/mois de naissance, accord aux offres personnalisées, bons).

## Fonctionnement réel, fermé par défaut

Le programme et les cinq règles sont initialement désactivés. Les taux de réduction et seuils commerciaux de panier/fréquence/dépenses sont vides : ils doivent être choisis avant activation. Aucun message ni aucune offre réelle ne sont créés pour les tests.

Règles : dernière commande payée depuis au moins 45 jours (modifiable) ; anniversaire demain selon Paris ; gros panier ; nombre de commandes dans une période ; dépenses de produits dans une période. Les deux dernières fidélisent les clients actifs. Les commandes annulées, impayées ou futures ne qualifient pas. Un client n’ayant jamais commandé n’est pas assimilé à un ancien client inactif. Les seuils financiers portent sur les produits avant remises, hors livraison. Le 29 février est ciblé uniquement en année bissextile.

Un minuteur serveur évalue les règles toutes les 15 minutes et au démarrage, sous le verrou commun de la base. Il nécessite l’activation globale, une règle active, l’accord explicite du client et la plage horaire. Déduplication persistante par événement et client ; anniversaire au maximum une fois par année ; délai de sécurité entre deux offres et quota global journalier. Si plusieurs règles correspondent, leur ordre fixe détermine la priorité. L’aperçu ne modifie aucune donnée.

Les bons sont personnels, valables un nombre de jours configurable, à usage unique après paiement. La meilleure réduction est appliquée **côté serveur** aux produits, sans cumul avec bienvenue/Bibou + ; la livraison offerte Bibou + reste compatible. Un paiement en cours réserve le bon. Un checkout déjà ouvert et encore incertain le conserve réservé jusqu’à résolution, pour éviter un double usage. Une utilisation payée n’est pas automatiquement rétablie après annulation/remboursement. La pause bloque les nouvelles offres mais ne retire pas les bons accordés.

## Canaux et consentement

- Compte client : fonctionnel sur web et natif, sans fournisseur supplémentaire.
- Push optionnel : file d’envoi existante, double consentement (offres personnalisées + push marketing), appareil et flags serveur requis ; révérification avant envoi. Aucun push réel envoyé pendant le développement.
- SMS et e-mail marketing : **non connectés**. Twilio reste utilisé pour l’authentification.

La saisie de l’anniversaire ne vaut pas accord marketing. Le client peut modifier/effacer sa date et retirer son consentement. Les préférences sont datées. La suppression du compte enlève aussi ses offres et associations push. Ne jamais activer rétroactivement les préférences d’anciens clients. Les sauvegardes restent soumises aux précautions de restauration déjà documentées.

## Statistiques et limites

Périodes 7/30/90/365 jours : clients acheteurs, commandes payées, ventes TTC incluant livraison, panier moyen, nouveaux comptes, acheteurs récurrents. Segments globaux : jamais commandé, inactifs 45 jours, accords marketing et anniversaires renseignés.

Résultats : bons créés sur la période, utilisation par paiement non annulé sur la même période, remises et ventes associées par règle. Ce n’est pas un calcul de rentabilité incrémentale ni un taux de lecture. Le résultat push technique est limité aux sept jours conservés par le module push. Les remboursements SumUp externes ne sont pas synchronisés et doivent aussi être traités côté commande. Les achats hors application ne sont pas importés. Les bons et données des comptes supprimés disparaissent des statistiques nominatives.

## Architecture

Logique métier dans `server/crm.js`, transport/ordonnancement dans `server/server.js`, portail dans `restaurant-dashboard/crm.js`, préférences client dans `CustomerOffers.js`. Le calcul du prix reste autoritaire côté serveur. Paramètres versionnés pour empêcher l’écrasement entre onglets ; routes administratives protégées ; aperçu et GET sans écriture CRM.

L’installation est encore **mono-restaurant** : une base et un mot de passe gestionnaire. Aucun tenant, rôle employé, facturation de restaurants ni administration propriétaire n’a été ajouté. Avant de vendre une plateforme mutualisée, isoler toutes les données et autorisations par établissement, externaliser marque/configuration et migrer vers une base adaptée. Aucun renommage en Crocli.

## Vérification locale

`npm test` couvre les seuils, Paris/anniversaire, consentements, quotas, doublons, reprise, annulation, accès client/restaurant, offres et prix serveur. `server/test-fixtures/preview-crm.cjs` sert une démonstration explicitement fictive, avec données temporaires et aucun fournisseur actif. Ne jamais pointer ce script sur `server/data.json`.

Vérification du 19 septembre 2026 : 177 tests réussis, exports web, iOS et Android réussis sans chargement du fichier `.env`. Contrôle visuel du portail sur ordinateur et écran étroit ; parcours Mon compte → Mes offres, rejet d’une date invalide, retrait du consentement et effacement de l’anniversaire vérifiés avec un compte fictif. La remise personnelle s’affiche dans le panier. Les appels push des tests utilisent un faux fournisseur, sans envoi réseau réel. Les exports natifs ne sont pas des applications signées : aucun build signé iOS/Android ni réception sur téléphone réel ne sont inclus dans cette validation.

La mise en ligne exige les trois déploiements coordonnés : API, portail restaurant et application web. Les nouveaux automatismes restent en pause après déploiement jusqu’à configuration et confirmation explicites du restaurateur.
