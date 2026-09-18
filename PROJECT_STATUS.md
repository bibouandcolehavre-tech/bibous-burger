# Point de reprise — 19 septembre 2026

Ce document sert de point de reprise pour le développement de l’application Bibou's Burgers.

## Version actuellement publiée

- Application client : https://bibous-burger-app.onrender.com/
- Espace restaurant : https://bibous-burgers-restaurant.onrender.com/
- API : https://bibous-burger.onrender.com/api
- Dernière version du code : branche `main` sauvegardée sur GitHub.

## État validé

- Correctif de packaging Render : `news-config.js` est désormais inclus explicitement dans l’image serveur. Le premier déploiement des actualités (`3a358a6`) avait échoué au démarrage avec `MODULE_NOT_FOUND` ; un test reproduisant les fichiers copiés par Docker vérifie désormais le démarrage et les routes publiques avant publication, sans données réelles. Suite complète après correction : 134/134 tests réussis.
- Accueil : le carrousel est désormais « Nos actualités », sans carte de burger. Quatre cartes par défaut : vidéo Epicu du 2 mai 2026 (Reel DX1QN8DIdet, identifié sur le profil Instagram), réseaux sociaux, concours en préparation et article Paris-Normandie. Les burgers restent dans la carte des produits.
- Nouvelle rubrique restaurant « Actualités & concours » : actualités modifiables, liens/photos par URL HTTPS, ordre, visibilité et ajout/retrait ; propagation à l’ouverture puis toutes les 60 secondes. Modifications non enregistrées préservées et contrôle de version contre les écrasements concurrents.
- Concours préparé, NON LANCÉ : brouillon privé avec dates/lots/règlement/aperçu, suivi et classement ; parcours fictif vérifié de bout en bout (deux participants, un nouveau filleul, compteur personnel et restaurant concordants). Aucune activation possible depuis l’interface/API, aucune publication Instagram ou publicité. Voir `CONTEST_LAUNCH.md` pour les décisions restantes et la finalisation juridique/technique avant lancement.
- Numéros clients : preuve de vérification enregistrée uniquement après accord Twilio ; changement de numéro impossible par simple modification de profil. Conservation limitée des participations et retrait lors de la suppression du compte. Aucun SMS réel envoyé pendant les tests.
- 133 tests automatisés réussis et export web revérifié après les actualités, le concours et les protections des numéros. Premier montage tutoriel généré : `../video-demo/Bibous-Burgers-tutoriel-fr-v2.mp4`, 71 secondes, 1080 × 1920, captures réelles sur une base fictive et narration française de synthèse (voix macOS Thomas, pas un comédien enregistré). L’accueil montre bien Epicu. Images de contrôle et présence du son vérifiées ; aucune opération bancaire. Fichier conservé localement, hors du dépôt Git, à écouter/valider avant publication Instagram.
- Réseaux sociaux intégrés au carrousel de l’accueil : diapositive « Suivez-nous » en deuxième position par défaut, fond sombre, trois logos vectoriels Instagram/Facebook/TikTok cliquables séparément avec les liens exacts fournis par le propriétaire. Ancien bloc indépendant supprimé. Les indicateurs suivent les cartes visibles ; le repère actif suit le défilement. Ouverture externe, aucun SDK social ou suivi publicitaire. Vérification à 390 px et au clavier ; l’application reste dans son onglet.
- Les quatre en-têtes jaunes « Nos menus », « Nos burgers », « Petites faims » et « Boissons » occupent toute la largeur.
- Carte comprenant menus, burgers seuls, petites faims et boissons.
- Photos officielles des burgers et produits SumUp, avec boissons détourées sur fond crème neutre.
- Personnalisation des produits, panier et suggestions de ventes additionnelles.
- Livraison dans un rayon de 5 km avec tarification par distance et deux places par créneau.
- Click & Collect et tables : heures fixes toutes les 15 minutes pendant les services. Tables jusqu’à quatre personnes ; deux réservations par demi-heure, partagées entre :00/:15 et :30/:45. Livraison inchangée (intervalles de 30 minutes, capacité deux). Les anciennes réservations conservent leur horaire et consomment toujours la capacité.
- Paiement SumUp connecté et opérationnel.
- Confirmation renforcée : contrôle montant/devise/commerçant/référence, reprise du même paiement, récupération après réponse perdue, erreurs SumUp explicites et aucun recrédit sur confirmations répétées. Une commande annulée reste annulée même après retour tardif de paiement.
- Connexion par SMS Twilio configurée ; le profil professionnel a été approuvé.
- Avis Google connectés et affichés en français.
- Comptes clients, suivi des commandes et espace restaurant.
- Fidélité, multiplicateurs hebdomadaires, parrainage, cinq prestiges et cadeau de bienvenue. Bonus retrait anticipé ×2 : commande enregistrée par le serveur au moins 30 minutes avant le retrait (Europe/Paris), attribué après paiement, cumulable avec Bibou + et le bonus hebdomadaire, jamais sur le parrainage. Les nouvelles commandes seulement ; annulations et callbacks répétés testés.
- Récompenses de palier réclamables une seule fois, sans retrait de points, avec code unique validé dans l’espace restaurant.
- Gestion des produits disponibles/en rupture dans l’espace restaurant, avec recherche et filtres. Propagation aux produits, aux options, aux suggestions et au panier. Contrôle serveur avant création de commande et de paiement.
- Rubrique Fidélité clients active dans l’espace restaurant : recherche par prénom/téléphone/code, filtres et pagination, soldes et prestiges, Bibou +, état des récompenses, parrainages inscrits/validés/en attente et dernières commandes payées. Consultation seule, sans modification des points, sans adresses ni références de paiement. Comptes supprimés exclus.
- Alertes sonores réelles pour nouvelles commandes payées, réservations et récompenses, avec activation, test et mise en sourdine. Compteurs cliquables, total dans l’onglet, indicateur de connexion et protection contre les alertes répétées.
- Bibou + à 9,99 € pour 30 jours : livraison offerte, remise de 5 % et points doublés.
- Politique de confidentialité et suppression de compte.
- Configuration Expo/EAS préparée pour iOS et Android.
- Sauvegardes automatiques horaires des données et stocks sur le disque persistant, rotation horaire/quotidienne sur une semaine, contrôle d’intégrité, accès restaurant pour créer/télécharger une copie, et outil de récupération séparée sans écrasement. Pas de nouvelle dépense ni de stockage externe activé.
- 124 tests automatisés réussissent, dont liens sociaux, reprise des paiements/commandes après interruption, limitation des connexions, initialisation sans données embarquées, consultation clients sans écriture, accès privés, recherche, paliers, parrainages, abonnements expirés, suppression de compte, réponses tardives et échappement HTML ; sauvegardes, stock, paiements et annulations restent vérifiés (sans paiement ni SMS réels).
- Reprise persistante des paiements de commande et Bibou + après fermeture/actualisation : journal limité au compte, création idempotente, contrôle serveur, indication visible des erreurs et accès depuis l’accueil. Un succès indique la transmission au restaurant, sans prétendre que la préparation a déjà commencé.
- Connexion persistante chiffrée sur iPhone/Android, déconnexion explicite, session conservée en cas de panne réseau. Les messages simples qui étaient silencieux dans le navigateur sont désormais visibles.
- Exports web/iOS/Android précédemment réussis, Expo Doctor 21/21 et audit npm sans vulnérabilité connue après correction ciblée UUID. Export web revérifié après ajout des réseaux sociaux. `.easignore` et `.dockerignore` excluent données locales et secrets. Expo connecté au compte `bibouburgers`, projet `bibous-burger` de `bibou-and-co` associé dans `app.json`. Aucune création de binaire signé ni soumission : le propriétaire a explicitement suspendu cette préparation pour poursuivre les modifications de l’application. Voir `RELEASE_READINESS.md`.
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
6. Après accord explicite pour reprendre les versions installables : générer les premières versions iPhone/Android et effectuer un test complet sur appareils réels. Le compte Expo est connecté et le projet associé ; les exports JavaScript ne remplacent pas ces builds signés. EAS Update n’est pas encore configuré : ne pas promettre des mises à jour natives à distance déjà actives.
7. Préparer les captures d’écran, les informations légales finales et les fiches Apple App Store et Google Play.

## Précautions

- Ne jamais publier les clés SumUp, Twilio, Google ou les mots de passe dans Git.
- Ne pas ajouter `server/data.json` à un commit : il peut contenir des données locales de test ou de clients.
- Les données de production sont conservées sur le disque persistant du service Render et ne doivent pas être remplacées par le fichier local.
- Les ruptures persistent dans `product-stock.json` à côté du fichier de données ; inclure ce fichier dans les sauvegardes. Une rupture ne révoque pas les liens SumUp déjà ouverts ni les commandes payées.
- Les alertes nécessitent un clic sur « Activer le son », un tableau ouvert, un Mac éveillé et un volume audible. Le premier chargement est silencieux ; pas de notification en dehors de la page. Garder un seul onglet, idéalement au premier plan pendant le service.
- Les données JSON utilisent un verrou mono-processus et des remplacements atomiques : conserver une seule instance serveur. La migration vers une base transactionnelle reste à prévoir.
- Les copies `/var/data/backups` restent sur le même disque ; elles ne couvrent pas à elles seules une perte du disque. Téléchargements privés contenant des données clients, sans chiffrement individuel. Lire la procédure du README avant toute récupération réelle ; ne jamais restaurer en production sans validation et réconciliation des opérations plus récentes.
- Aucune opération bancaire réelle faite pendant les tests. Pas de remboursement automatique : annuler dans le tableau restaurant ET rembourser dans SumUp. Le suivi automatique des remboursements reste à compléter ; la reprise après rechargement est maintenant implémentée.

## Idées discutées, non lancées

- Concours Instagram de parrainage : mécanisme et préparation maintenant implémentés et testés sur données fictives ; dates/lots/règlement et lancement restent à valider. Les règles de départage, le tirage et la désignation des gagnants ne sont pas encore implémentés. Aucun concours actif ni lot engagé. La vidéo Epicu s’ouvre sur Instagram (qui peut demander une connexion) ; ce n’est pas une copie hébergée de son contenu.
- Avis Google : un avis contraire aux règles peut être signalé, mais aucune suppression n’est garantie. Ne pas offrir de récompenses en échange d’un avis ou de sa suppression (règles Google).
