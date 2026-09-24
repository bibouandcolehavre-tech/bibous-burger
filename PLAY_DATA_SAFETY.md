# Google Play — données déclarées le 24 septembre 2026

Sources examinées : App.js, server/server.js, server/reservations.js, server/account-deletion.js, modules CRM/fidélité/push, push-client.native.js, package.json et app.json. Ne pas extrapoler cette déclaration à de futurs SDK.

Références officielles :
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://firebase.google.com/docs/android/play-data-disclosure (FCM et Installations)

## Réponses

Collecte = oui ; transfert chiffré = oui (API et prestataires HTTPS). Création du compte = numéro de téléphone + autre authentification (code SMS). Suppression complète : https://bibous-burger-app.onrender.com/?legal=delete-account. Pas de procédure distincte de suppression de l'historique en conservant le compte ; ne pas promettre une suppression automatique de toutes les données sous 90 jours.

Toutes les catégories ci-dessous sont **collectées**, non éphémères. Pas de partage à déclarer selon les exceptions Google pour sous-traitants et transferts à l'initiative explicite du client. Cela ne signifie pas qu'aucun prestataire ne traite les données : Twilio, Render, Expo/FCM, Google et SumUp sont décrits dans la politique.

| Type | Facultatif | Finalités |
| --- | --- | --- |
| Nom | Non pour commander/réserver | Fonctionnement, gestion du compte |
| ID utilisateur | Non pour les fonctions du compte | Fonctionnement, gestion du compte, sécurité, statistiques, marketing et personnalisation des offres |
| Adresse | Oui : retrait/réservation sans livraison | Fonctionnement, gestion du compte |
| Téléphone | Non pour les fonctions du compte | Fonctionnement, gestion du compte, sécurité |
| Autres infos personnelles : anniversaire jour/mois | Oui | Fonctionnement des offres, marketing, personnalisation |
| Historique des achats | Non pour commander | Fonctionnement, statistiques restaurant, marketing/personnalisation sur consentement, sécurité/conformité |
| Autre contenu utilisateur : note de réservation | Oui | Fonctionnement |
| Autres actions : réservations, récompenses, consentements | Oui | Fonctionnement, gestion du compte, sécurité |
| ID appareil/installation/notification | Non au sens global du SDK | Fonctionnement, marketing push sur consentement, sécurité |

L'identifiant Firebase Installation est généré par le SDK, indépendamment du consentement marketing ; ne pas déclarer l'ensemble des ID comme facultatifs uniquement parce que les push le sont. Aucun Google Analytics, Crashlytics ou export BigQuery ajouté.

Pas d'accès GPS : l'adresse de livraison est saisie manuellement et envoyée à Google Routes pour calculer la distance. Pas de collecte de la position courante du téléphone. Pas de carnet d'adresses, de photos personnelles, de microphone, de fichiers utilisateur ou de lecture SMS.

Pas de collecte de carte bancaire dans le client : ouverture du navigateur externe vers la page SumUp ; l'API reçoit le statut, montant et référence de paiement, pas le numéro de carte. Déclaré dans l'historique des achats. Pas d'adresse e-mail demandée par l'app.

Les identifiants techniques ne servent pas au suivi publicitaire tiers. Les statistiques de commandes et offres internes sont néanmoins déclarées en Analyse et Marketing pour les ID/historiques concernés. Les informations saisies dans le compte fictif de revue ne représentent pas des clients réels.

## État

Déclaration finale enregistrée dans Play ; message « Modification enregistrée » vérifié le 24 septembre 2026. Public cible 13–15, 16–17 et 18+ également enregistré selon la réponse du propriétaire. Les sous-formulaires des neuf types sont terminés. Revoir les réponses si le fonctionnement change. Cela ne constitue pas encore l'envoi de l'application pour examen.
