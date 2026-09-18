# Point de reprise — 18 septembre 2026

Ce document sert de point de reprise pour le développement de l’application Bibou's Burgers.

## Version actuellement publiée

- Application client : https://bibous-burger-app.onrender.com/
- Espace restaurant : https://bibous-burgers-restaurant.onrender.com/
- API : https://bibous-burger.onrender.com/api
- Dernière version du code : branche `main` sauvegardée sur GitHub.

## État validé

- Les quatre en-têtes jaunes « Nos menus », « Nos burgers », « Petites faims » et « Boissons » occupent toute la largeur.
- Carte comprenant menus, burgers seuls, petites faims et boissons.
- Photos officielles des burgers et produits SumUp, avec boissons détourées sur fond crème neutre.
- Personnalisation des produits, panier et suggestions de ventes additionnelles.
- Livraison dans un rayon de 5 km avec tarification par distance et deux places par créneau.
- Click & Collect et réservation de table jusqu’à quatre personnes, avec deux réservations par créneau.
- Paiement SumUp connecté et opérationnel.
- Connexion par SMS Twilio configurée ; le profil professionnel a été approuvé.
- Avis Google connectés et affichés en français.
- Comptes clients, suivi des commandes et espace restaurant.
- Fidélité, multiplicateurs hebdomadaires, parrainage, cinq prestiges et cadeau de bienvenue.
- Récompenses de palier réclamables une seule fois, sans retrait de points, avec code unique validé dans l’espace restaurant.
- Gestion des produits disponibles/en rupture dans l’espace restaurant, avec recherche et filtres. Propagation aux produits, aux options, aux suggestions et au panier. Contrôle serveur avant création de commande et de paiement.
- Bibou + à 9,99 € pour 30 jours : livraison offerte, remise de 5 % et points doublés.
- Politique de confidentialité et suppression de compte.
- Configuration Expo/EAS préparée pour iOS et Android.
- 56 tests automatisés réussissent, dont un test HTTP isolé (sans paiement ni SMS réels).
- Export web réussi ; rupture/restauration de boissons, options de menu et blocage d’un panier existant vérifiés dans un environnement local avec données fictives.

## Prochaines priorités recommandées

1. Retester l’envoi d’un SMS vers un numéro réel non vérifié après l’approbation Twilio.
2. Terminer l’espace restaurant : modification de la carte et gestion détaillée de la fidélité clients (la disponibilité est maintenant implémentée).
3. Ajouter une vraie notification sonore pour les nouvelles commandes, réservations et récompenses.
4. Fiabiliser la confirmation des paiements et la gestion des remboursements SumUp.
5. Ajouter des sauvegardes automatiques des données de production.
6. Générer une première version installable iPhone/Android et effectuer un test complet sur appareils réels.
7. Préparer les captures d’écran, les informations légales finales et les fiches Apple App Store et Google Play.

## Précautions

- Ne jamais publier les clés SumUp, Twilio, Google ou les mots de passe dans Git.
- Ne pas ajouter `server/data.json` à un commit : il peut contenir des données locales de test ou de clients.
- Les données de production sont conservées sur le disque persistant du service Render et ne doivent pas être remplacées par le fichier local.
- Les ruptures persistent dans `product-stock.json` à côté du fichier de données ; inclure ce fichier dans les sauvegardes. Une rupture ne révoque pas les liens SumUp déjà ouverts ni les commandes payées.

## Idées discutées, non lancées

- Concours Instagram de parrainage : lien personnel et comptage des nouveaux inscrits vérifiés par SMS, distinct des points fidélité (le parrainage habituel reste crédité après une première commande payée). Durée, lots, règlement, protection contre les doublons et départage restent à choisir. Aucun concours ni lot n’a été publié ou engagé.
- Avis Google : un avis contraire aux règles peut être signalé, mais aucune suppression n’est garantie. Ne pas offrir de récompenses en échange d’un avis ou de sa suppression (règles Google).
