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
- Confirmation renforcée : contrôle montant/devise/commerçant/référence, reprise du même paiement, récupération après réponse perdue, erreurs SumUp explicites et aucun recrédit sur confirmations répétées. Une commande annulée reste annulée même après retour tardif de paiement.
- Connexion par SMS Twilio configurée ; le profil professionnel a été approuvé.
- Avis Google connectés et affichés en français.
- Comptes clients, suivi des commandes et espace restaurant.
- Fidélité, multiplicateurs hebdomadaires, parrainage, cinq prestiges et cadeau de bienvenue.
- Récompenses de palier réclamables une seule fois, sans retrait de points, avec code unique validé dans l’espace restaurant.
- Gestion des produits disponibles/en rupture dans l’espace restaurant, avec recherche et filtres. Propagation aux produits, aux options, aux suggestions et au panier. Contrôle serveur avant création de commande et de paiement.
- Rubrique Fidélité clients active dans l’espace restaurant : recherche par prénom/téléphone/code, filtres et pagination, soldes et prestiges, Bibou +, état des récompenses, parrainages inscrits/validés/en attente et dernières commandes payées. Consultation seule, sans modification des points, sans adresses ni références de paiement. Comptes supprimés exclus.
- Alertes sonores réelles pour nouvelles commandes payées, réservations et récompenses, avec activation, test et mise en sourdine. Compteurs cliquables, total dans l’onglet, indicateur de connexion et protection contre les alertes répétées.
- Bibou + à 9,99 € pour 30 jours : livraison offerte, remise de 5 % et points doublés.
- Politique de confidentialité et suppression de compte.
- Configuration Expo/EAS préparée pour iOS et Android.
- Sauvegardes automatiques horaires des données et stocks sur le disque persistant, rotation horaire/quotidienne sur une semaine, contrôle d’intégrité, accès restaurant pour créer/télécharger une copie, et outil de récupération séparée sans écrasement. Pas de nouvelle dépense ni de stockage externe activé.
- 100 tests automatisés réussissent, dont consultation clients sans écriture, accès privés, recherche, paliers, parrainages, abonnements expirés, suppression de compte, réponses tardives et échappement HTML ; sauvegardes, stock, paiements et annulations restent vérifiés (sans paiement ni SMS réels).
- Export web réussi ; rupture/restauration de boissons, options de menu et blocage d’un panier existant vérifiés dans un environnement local avec données fictives.
- Alertes vérifiées dans le navigateur : activation, test du son, arrivée simultanée d’une commande payée et d’une table fictives, compteurs, accès aux réservations et mise en sourdine ; aucune erreur JavaScript observée.
- Écran Sauvegardes vérifié dans un navigateur local : création automatique et manuelle, téléchargement d’une archive fictive, lisibilité et absence d’erreurs JavaScript. Aucun téléchargement de données clients réelles ni restauration de production pendant ces tests.
- Fidélité clients vérifiée localement avec 29 comptes fictifs : recherche, pagination, filtre Bibou +, fiche avec parrainages et récompenses, affichage de bureau et largeur mobile de 390 px sans débordement horizontal. Aucun compte réel consulté pour ces tests.

## Prochaines priorités recommandées

1. Retester l’envoi d’un SMS vers un numéro réel non vérifié après l’approbation Twilio.
2. Compléter la modification de la carte dans l’espace restaurant ; la disponibilité et la consultation détaillée des clients/fidélité sont maintenant implémentées. Une correction manuelle de points demanderait un historique audité dédié.
3. Étudier des notifications push pour recevoir une alerte lorsque le tableau est fermé (les sons dans la page sont maintenant implémentés).
4. Synchroniser les remboursements réalisés dans SumUp à partir des transactions (la confirmation de paiement et la protection des annulations sont renforcées). Annuler dans l’application reste distinct du remboursement bancaire.
5. Organiser une copie régulière hors du serveur et un exercice de récupération avant ouverture publique (l’historique automatique sur disque est implémenté).
6. Générer une première version installable iPhone/Android et effectuer un test complet sur appareils réels.
7. Préparer les captures d’écran, les informations légales finales et les fiches Apple App Store et Google Play.

## Précautions

- Ne jamais publier les clés SumUp, Twilio, Google ou les mots de passe dans Git.
- Ne pas ajouter `server/data.json` à un commit : il peut contenir des données locales de test ou de clients.
- Les données de production sont conservées sur le disque persistant du service Render et ne doivent pas être remplacées par le fichier local.
- Les ruptures persistent dans `product-stock.json` à côté du fichier de données ; inclure ce fichier dans les sauvegardes. Une rupture ne révoque pas les liens SumUp déjà ouverts ni les commandes payées.
- Les alertes nécessitent un clic sur « Activer le son », un tableau ouvert, un Mac éveillé et un volume audible. Le premier chargement est silencieux ; pas de notification en dehors de la page. Garder un seul onglet, idéalement au premier plan pendant le service.
- Les données JSON utilisent un verrou mono-processus et des remplacements atomiques : conserver une seule instance serveur. La migration vers une base transactionnelle reste à prévoir.
- Les copies `/var/data/backups` restent sur le même disque ; elles ne couvrent pas à elles seules une perte du disque. Téléchargements privés contenant des données clients, sans chiffrement individuel. Lire la procédure du README avant toute récupération réelle ; ne jamais restaurer en production sans validation et réconciliation des opérations plus récentes.
- Aucune opération bancaire réelle faite pendant les tests. Pas de remboursement automatique : annuler dans le tableau restaurant ET rembourser dans SumUp. Le suivi automatique des remboursements et la reprise d’un paiement après rechargement de la page client restent à compléter.

## Idées discutées, non lancées

- Concours Instagram de parrainage : lien personnel et comptage des nouveaux inscrits vérifiés par SMS, distinct des points fidélité (le parrainage habituel reste crédité après une première commande payée). Durée, lots, règlement, protection contre les doublons et départage restent à choisir. Aucun concours ni lot n’a été publié ou engagé.
- Avis Google : un avis contraire aux règles peut être signalé, mais aucune suppression n’est garantie. Ne pas offrir de récompenses en échange d’un avis ou de sa suppression (règles Google).
