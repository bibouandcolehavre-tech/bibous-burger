# Accès isolé pour les examinateurs des boutiques

Autorisation explicite du propriétaire reçue le 24 septembre 2026 pour créer cet accès et le transmettre à Google. Ce n'est pas un contournement de l'authentification client.

## Isolation

- Entrée visible depuis la connexion client : « Accès de vérification des boutiques ».
- Code aléatoire 192 bits ; seul son SHA-256 est dans `server/review-sandbox.js`. Aucun secret ajouté au bundle client.
- Chaque connexion crée son propre compte fictif et son stockage en mémoire, sans référence à la base réelle ni à son verrou. TTL 24 h, maximum 30 sessions, 50 commandes/achats/réservations par session.
- Jetons `review.*` aléatoires, refusés explicitement avant toutes les routes réelles. Les sessions clientes réelles restent signées `v1.*`.
- Tous les appels authentifiés du client de test vont dans `/api/review/`. Route inconnue refusée, jamais de repli vers la production.
- Le module isolé importe uniquement crypto et les règles métier ; pas de fichiers, base réelle, clé prestataire ou appel réseau. Les modèles de prix, fidélité, horaires et réservations sont réutilisés.
- Compte fictif avec 1 500 points pour examiner les récompenses ; codes `TEST-…-NON-VALABLE`, aucun bon créé côté restaurant.
- Les confirmations de paiement et de table sont simulées et signalées. La géolocalisation de test utilise une distance fictive de 1 km. Les mutations de stock/créneaux réels sont impossibles.
- Préférences de notification simulées, aucun appareil inscrit, aucun SMS, aucune notification envoyée. Parrainage externe désactivé pour éviter des liens fictifs partagés.
- Les données de test disparaissent à l'expiration, à la suppression du compte de test ou au redémarrage. Le code d'accès reste utilisable pour recommencer.
- Limiteurs de connexion et de requêtes ; aucun retour de secret dans les réponses.

## Exploitation

- Code privé conservé HORS du dépôt dans le dossier voisin `private-google-play-20260924/access-code.txt`, droits fichier 600 / dossier 700. Ne pas l'ajouter à Git ni aux documents publics.
- Désactivation serveur : `STORE_REVIEW_ENABLED=false`, puis redéploiement. Ne pas désactiver pendant une validation boutique ou les contrôles ultérieurs sans solution de remplacement.
- Rotation : générer un nouveau code aléatoire, remplacer uniquement le hash serveur et mettre à jour les instructions privées Play. Ne pas utiliser un mot de passe de vrai compte.
- Aucun changement de compte développeur, de clé de signature ou de formule Expo.

## Vérifications effectuées

- Tests d'isolation et d'idempotence : authentification, expiration, limites, stockage séparé, privilèges non modifiables, prix réels du catalogue, paiement simulé répété sans doubler les points, achat Bibou + idempotent, réservation, bons, consentements, suppression.
- Test HTTP vérifie que les jetons de test sont refusés sur commandes, restaurant, SMS et paiements réels avant accès aux données. Le fichier de données fictif utilisé pour ce test reste inchangé.
- Parcours navigateur local sans AUCUNE clé prestataire : connexion de test, activation Bibou +, panier, livraison, coordonnées, devis simulé, paiement simulé confirmé.
- Suite complète : 222 tests réussis. Export web réussi. Export Android et déploiements : voir `GOOGLE_PLAY_PUBLISHING.md`.

## Instructions à fournir à Google (en anglais)

From the home screen, tap “Mon compte”, then “Accès de vérification des boutiques”. Enter the private access code supplied in the password field of Play Console and tap “Ouvrir l’espace de test”. No username, phone, OTP or account creation is required. A persistent MODE DE TEST banner identifies this isolated account. The account has fictional contact details and 1,500 fictional loyalty points to inspect rewards. Use only those fictional details.

Ordering: return home, choose a product and its required options, add it to the cart, select delivery or pickup and a future available slot. For delivery, tap “Calculer mon tarif” (fixed fictional 1 km quote). Continue to the order summary, then tap “Simuler le paiement”. No card or real payment is needed; no order reaches the restaurant. Order history, table reservations (1–4 guests), rewards, optional birthday/consents, account deletion and Bibou + can all be inspected in the same isolated session. Bibou + activation simulates a 30-day purchase; no automatic renewal. Real customers pay for physical food/services on SumUp's hosted checkout.

Data is reset after 24 hours or a server restart. If a session expires or you delete the test account, repeat the same login steps with the same access code. Push delivery and referral sharing are intentionally disabled in this isolated account to avoid contacting real people. They are not hidden features. Normal customer login uses SMS.
