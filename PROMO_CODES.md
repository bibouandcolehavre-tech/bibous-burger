# Codes promotionnels — 26 septembre 2026

## Demande du propriétaire

Ajouter un champ au paiement pour le code `CHORUS`, offrant 100 % de la commande. La livraison est incluse. Aucun plafond, date d’expiration ni limite d’utilisation n’a été demandé : le code est réutilisable par tout client connecté qui le connaît. Il n’est pas annoncé publiquement dans l’interface ni enregistré dans le bundle client.

## Fonctionnement

- Saisie sur l’écran « Vérifie ta commande », validation par le serveur authentifié, insensible à la casse et aux espaces aux extrémités. Un code invalide bloque la confirmation tant qu’il n’est pas corrigé ou effacé.
- Produits, suppléments et frais de livraison passent à 0 €. Stocks, coordonnées, rayon de livraison et capacité des créneaux restent contrôlés par le serveur.
- Confirmation explicite par « Confirmer ma commande offerte · 0,00 € ». Aucun checkout SumUp, aucune carte, aucun débit. La commande est ensuite à accepter au restaurant comme les autres.
- Le workflow utilise `payment.status=PAID` pour « réglée », avec `provider=promotion` et `amount=0` pour distinguer clairement la gratuité d’un paiement bancaire. L’espace restaurant et la fiche client affichent le code et « Commande offerte · aucun débit bancaire ».
- Les autres remises (bienvenue, CRM) ne sont pas consommées. Par prudence, une commande intégralement offerte n’attribue pas de points, ne multiplie pas les points hebdomadaires et ne valide pas un parrainage. Ce fonctionnement est indiqué au client avant confirmation. Une première commande bancaire ultérieure reste éligible au parrainage.
- Les modifications de panier restent gratuites ; l’annulation ne crée pas de remboursement bancaire fictif.
- Le code fait partie de l’empreinte d’idempotence : rejouer une requête ne crée pas de doublon. Une ancienne tentative avec une autre remise n’est jamais réouverte automatiquement comme paiement bancaire après confirmation du panier gratuit.
- La capacité API `promoCodes:1` empêche un nouveau client de soumettre le code à une ancienne API qui l’ignorerait.
- Le bac à sable de revue reproduit la saisie du code sans toucher au service réel.

## Vérifications

- Suite complète : 259 tests réussis, aucun échec. Export web réussi (`AppEntry-d698f4266b3689cc0221bbaae7bb61f9.js`).
- Tests unitaires : normalisation/rejet, remises/frais, règlement gratuit, idempotence, reprise de paiement, modifications/annulations, parrainage et affichages restaurant/historique.
- Tests HTTP isolés : authentification, doublons concurrents, absence d’appel SumUp, confidentialité, conservation des autres avantages, capacité livraison, stock, créneau invalide, falsification de prix refusée, paiement ordinaire préservé.
- Parcours web vérifié dans un serveur local isolé : code invalide, `chorus` en minuscules, retrait/réapplication du code, affichage mobile 390 × 844, commande fictive confirmée à 0 € sans navigation SumUp et sans erreur console.
- Aucune vraie commande créée, aucun vrai SMS/paiement lancé, aucun compte client modifié pour les tests.

## Publication

Validation locale terminée. Une première tentative de commit/push avait été arrêtée par le contrôle de sécurité, dans l’attente d’une confirmation de la portée financière. Après explication explicite des conditions (100 % produits et livraison, réutilisable, sans plafond ni expiration), le propriétaire a confirmé le 26 septembre : « OK, tu peux mettre en ligne le code Chorus. » Cette confirmation autorise maintenant le déploiement web/API/restaurant de ces conditions exactes, sans création de vraie commande de test.

Déploiement confirmé le 26 septembre 2026, commit `667ba148536f152ddfd6bb0c0206b50d86fba563` poussé sur `origin/main`.

Vérifications publiques, sans compte ni commande de test réels :

- API `https://bibous-burger.onrender.com/api/health` : HTTP 200, version exacte du commit et capacité `promoCodes:1`. Le premier contrôle avait vu un HTTP 502 transitoire durant le redémarrage ; le contrôle suivant confirme le retour du service.
- Application `https://bibous-burger-app.onrender.com/` : HTTP 200, bundle `AppEntry-d698f4266b3689cc0221bbaae7bb61f9.js`, champ promo et confirmation gratuite présents. SHA-256 du bundle public identique à l’export local testé : `31ffa2c3202aaebdfff98bf2c2ec9f412ae073b9fe0aa1b179faf4be1d88c48c`.
- Restaurant `https://bibous-burgers-restaurant.onrender.com/` : HTTP 200, script `./app.js?v=promo-1`, libellé « Commande offerte · aucun débit bancaire » présent et contenu exactement identique au fichier local testé.
- 259 tests ont de nouveau réussi juste avant le commit, ainsi que l’export web.

Aucun nouveau binaire Android/iOS ni changement du dossier Google Play n’est lancé dans cette intervention. Les binaires déjà installés n’acquièrent pas ce nouveau champ sans une mise à jour dédiée.

Les modifications préexistantes de `RELEASE_READINESS.md` et `server/data.json` sont laissées intactes et hors commit.
