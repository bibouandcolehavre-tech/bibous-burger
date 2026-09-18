# Bibou's Burgers

Application de commande et de fidélité de Bibou & Co pour iPhone, Android et le web.

## Fonctionnalités prêtes

- carte complète avec menus, burgers, petites faims et boissons ;
- personnalisation sans prix affiché pour les choix gratuits, panier multi-produits et suggestions de compléments ;
- livraison et Click & Collect ;
- créneaux limités à deux livraisons ou réservations par tranche de 30 minutes ;
- paiement sécurisé hébergé par SumUp ;
- connexion client par code SMS Twilio ;
- suivi des commandes et espace restaurant séparé ;
- alertes sonores et compteurs persistants pour les nouvelles commandes payées, réservations et récompenses ;
- disponibilité des produits pilotée dans « Carte & disponibilité », avec blocage des produits et options épuisés avant la création du paiement ;
- programme fidélité, parrainage, prestiges et récompenses à code unique validées par le restaurant ;
- Bibou + : livraison offerte, remise de 5 % et points doublés pendant 30 jours ;
- cadeau de bienvenue de 10 % sur la première commande ;
- réservation de table jusqu’à quatre personnes ;
- avis Google, politique de confidentialité et suppression de compte.

## Développement local

### Notifications clients

Le compte client propose deux choix indépendants (suivi des commandes/tables et offres), tous deux désactivés par défaut. L’espace restaurant contient « Notifications clients » pour préparer un message, vérifier les destinataires et confirmer l’envoi. Les envois restent désactivés tant que les identifiants Apple/Android et les tests sur téléphone ne sont pas terminés. Le navigateur ne reçoit pas de push natif et aucun binaire signé n’a été généré. Voir [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md) pour l’activation et les limites.

### Lancement local

1. Installer les dépendances avec `npm install`.
2. Lancer l’API avec `npm run server`.
3. Lancer l’application avec `npm start`.

Les secrets SumUp, Twilio, Google, le mot de passe restaurant et la clé de session restent uniquement dans les variables d’environnement du serveur.

## Disponibilité des produits

Dans l’espace restaurant, « Carte & disponibilité » permet de chercher un produit, de filtrer les ruptures et de le rendre disponible ou indisponible. Les prix ne changent pas. Les burgers seuls et leurs menus se règlent séparément.

Les boissons et accompagnements en rupture sont aussi bloqués dans les options. Les menus incluant des frites sont bloqués si les frites maison sont en rupture ; le Menu Duo dépend également des tenders. Le client se rafraîchit toutes les 15 secondes lorsqu’il est connecté, ainsi qu’au retour dans l’application. Son panier est revérifié avant la commande puis côté serveur avant la création du lien SumUp. Un lien SumUp déjà émis n’est pas révoqué par un changement de disponibilité ; les commandes déjà payées restent à traiter.

Les choix persistent dans `product-stock.json`, à côté de `DATA_FILE_PATH` (donc `/var/data/product-stock.json` sur Render). Ce fichier est distinct des commandes et clients, ignoré par Git, et inclus dans les sauvegardes automatiques. Il ne faut pas le remplacer au déploiement. En l’absence du fichier, les disponibilités initiales du catalogue sont utilisées ; une erreur de lecture bloque les validations au lieu de rouvrir tous les produits.

## Fidélité clients dans l’espace restaurant

La rubrique **Fidélité clients** est une consultation privée, protégée par la connexion restaurant. Recherche par prénom, téléphone français (`06…` ou `+33…`) ou code de parrainage, filtres Bibou + actif et clients avec filleuls, pages de dix clients classés par points. Les compteurs du haut concernent tous les comptes présents, pas seulement la recherche.

Chaque fiche affiche le solde enregistré, le prestige et le prochain palier (200, 400, 700, 1 500, 5 000 points), le statut et l’expiration Bibou +, le multiplicateur de la semaine courante, les récompenses et les dix dernières commandes payées. Les commandes annulées apparaissent dans l’historique, mais sont exclues du nombre et du montant des commandes actives payées. Les remboursements effectués uniquement chez SumUp ne sont pas encore connus de ces statistiques.

Le suivi de parrainage distingue filleuls inscrits, validés et en attente. Une validation exige le bonus effectivement attribué et une commande associée payée non annulée, sans révocation. Un compte supprimé n’apparaît plus dans les résultats ou les statistiques de filleuls. Aucun concours n’est activé et aucune règle de récompense n’est modifiée.

Les routes `GET /api/dashboard/customers` et `GET /api/dashboard/customers/:id` ne modifient pas les données, refusent les sessions clients et renvoient `Cache-Control: no-store`. Elles ne renvoient ni adresses de livraison ni liens/références de paiement. Les fiches sont effacées de l’écran à l’expiration de la session. Les réponses tardives après une nouvelle recherche, un changement de fiche ou une déconnexion sont ignorées. Actualisation toutes les 30 secondes dans cette rubrique ouverte, avec bouton manuel et messages d’erreur.

Les tests couvrent ces permissions, la consultation sans écriture, recherche, pagination, paliers alignés avec l’application, parrainages annulés, suppression de compte, abonnements/semaine expirés et protection de l’interface contre les textes malveillants et réponses tardives. Pas de correction manuelle de points ni d’export de fichier client dans cette version.

## Sauvegardes automatiques et récupération

Le serveur vérifie au démarrage puis toutes les cinq minutes si une copie est nécessaire (dernière copie vieille d’au moins une heure). Une copie contient l’intégralité de `DATA_FILE_PATH` et les disponibilités `product-stock.json`, lus sous le même verrou que les modifications de données et de stock. Aucune réinitialisation depuis les données de démonstration si le fichier à sauvegarder manque. Les secrets de configuration, sessions restaurant en mémoire et fichiers de l’application ne sont pas inclus.

Les copies compressées sont stockées dans le dossier `backups` à côté de `DATA_FILE_PATH`, soit `/var/data/backups` sur Render : dossier privé 0700 et fichiers 0600. Écriture temporaire synchronisée puis remplacement atomique, vérification SHA-256 et relecture avant rotation. Le contrôle détecte une corruption ; ce n’est ni du chiffrement ni une signature contre la falsification. Les fichiers sont ignorés par Git et Docker.

Conservation : copie la plus récente de chaque heure sur 24 heures et de chaque journée UTC sur 7 jours, avec chevauchement entre ces deux historiques. La toute dernière copie est toujours préservée, même après une longue interruption. Les copies manuelles suivent cette rotation. Plafonds de sécurité : 32 Mio de données JSON, 16 Mio par archive, 200 Mio d’archives au total et réserve de 32 Mio libres sur le disque. Si une limite ou une erreur empêche la copie, les anciennes copies restent intactes et l’espace restaurant affiche l’erreur ; faire adapter l’architecture avant d’atteindre ces limites.

Dans **Espace restaurant → Sauvegardes**, le mot de passe restaurant protège l’état des copies, leur création et leur téléchargement. Une copie de plus de deux heures déclenche un avertissement dans cet écran. Il n’y a pas d’alerte par email ni de restauration depuis l’interface. Les liens de téléchargement nécessitent une session restaurant et ne sont pas publics.

**Limite importante : les copies sont sur le même disque que les données.** Conserver régulièrement une archive téléchargée dans un stockage distinct, privé et sécurisé. Aucun stockage externe payant n’est activé. Render fournit aussi des instantanés quotidiens du disque ; un instantané du 18 septembre a été constaté dans le tableau Render. Ce mécanisme et ses limites sont décrits dans [la documentation Render](https://render.com/docs/disks#disk-snapshots). Un retour de version du code ne restaure pas les données du disque.

### Vérifier et préparer une récupération (hors production)

Depuis le projet, utiliser un chemin explicite vers une archive téléchargée et un **nouveau dossier inexistant** :

```sh
node server/restore-backup.js --check /chemin/prive/bibou-COPIE.json.gz
node server/restore-backup.js --extract /chemin/prive/bibou-COPIE.json.gz /chemin/prive/nouvelle-recuperation
```

La première commande ne modifie rien. La seconde extrait uniquement `data.json` et `product-stock.json` dans le nouveau dossier ; elle refuse tout dossier existant et ne touche jamais au serveur en service. Les tests automatisés vérifient cette récupération sur données fictives, ainsi que corruption, disque plein, accès refusé aux clients, rotation et redémarrage.

Pour une vraie restauration : faire valider l’opération par le responsable, mettre la prise de commandes et le serveur en pause, conserver l’état actuel séparément, vérifier les deux fichiers extraits, puis faire remplacer les deux fichiers ensemble par l’opérateur. Ne jamais démarrer un serveur de test sur la copie avec des clés de paiement/SMS de production. Avant réouverture, réconcilier les paiements, remboursements, abonnements, points, stocks et réservations survenus après la copie ; réappliquer les suppressions/anonymisations de comptes intervenues depuis. Une sauvegarde ancienne ne révoque aucun paiement bancaire et peut contenir des données d’un compte supprimé depuis. Les téléchargements conservés ailleurs sont sous la responsabilité du restaurant et doivent suivre une durée de conservation adaptée.

`npm test` couvre les droits d’accès, les ruptures, les options, la persistance, les écritures concurrentes et les blocages de commande/paiement avec des données temporaires, sans appel SumUp ou SMS.

## Alertes du restaurant

Au début du service, ouvrir l’espace restaurant, se connecter puis cliquer sur « Activer le son ». Un court carillon confirme l’activation ; « Tester le son » permet de vérifier le volume et la sortie audio. « Couper le son » conserve tous les indicateurs visuels. Le choix silencieux est mémorisé, mais un rechargement peut demander une nouvelle activation du son dans le navigateur.

Le tableau vérifie les demandes toutes les 10 secondes et au retour au premier plan. Une nouvelle commande ne déclenche une alerte que si elle est payée et encore à accepter. Les réservations en attente et récompenses à remettre ont également leur son. Le premier chargement reste silencieux, les compteurs affichent déjà les demandes existantes. Chaque demande ne sonne qu’une fois par session de page, même après une réponse vide ou une reconnexion. Les arrivées reçues pendant le mode silencieux ne sont pas rejouées ensuite.

Les trois compteurs permettent d’ouvrir la rubrique correspondante ; le nombre total apparaît aussi dans le titre de l’onglet. Un indicateur signale une perte de connexion, une actualisation échouée ou des données trop anciennes. Une session expirée demande une reconnexion.

Ce sont des alertes **dans la page**, pas des notifications push : garder le tableau ouvert, le Mac éveillé et le volume audible. Utiliser un seul onglet pour éviter les sons en double. Le navigateur peut ralentir les onglets en arrière-plan : garder le tableau au premier plan pendant le service.

`server/dashboard-alerts.test.js` vérifie les arrivées, paiements, doublons, erreurs réseau, reprise, mode silencieux et génération des sons, avec un contrôleur de tableau et des données simulés.

## Paiements et annulations

Les retours SumUp sont revérifiés côté serveur : identifiant, référence enregistrée, montant, devise et commerçant doivent correspondre. Un échec de vérification renvoie une erreur pour permettre une nouvelle tentative du fournisseur, conformément au fonctionnement des [webhooks SumUp](https://developer.sumup.com/online-payments/webhooks). Les réponses répétées ne recréditent ni fidélité, ni parrainage, ni jours Bibou +.

Pour une même commande, un paiement existant est réutilisé. Une référence est enregistrée avant l’appel SumUp : si la réponse est perdue, le serveur recherche le paiement correspondant au lieu d’en créer un deuxième. En cas d’incertitude, la reprise est bloquée et invite à vérifier, sans lancer un nouvel encaissement.

Le client conserve désormais un journal avant toute création : identifiant de tentative, identifiant du compte, produits/options, mode et créneau, sans nom, téléphone, adresse, carte bancaire ni token. Il survit aux rechargements et fermetures. La reprise nécessite une session du même compte et une vérification serveur. L’API `GET /api/customer/payment-attempts/:requestId` refuse les autres comptes ; `POST /api/orders` rejoue la même commande pour le même identifiant et refuse un contenu différent. Bibou + bénéficie aussi de la reprise, y compris après activation, sans nouvelle prolongation ni nouveau paiement. Une déconnexion conserve uniquement ce journal non secret (maximum sept jours à la lecture) ; la suppression de compte l’efface.

La session mobile est stockée avec Expo SecureStore (trousseau iOS/stockage chiffré Android). Le journal non secret utilise AsyncStorage. Le web conserve ses clés existantes dans le stockage local ; aucun secret fournisseur n’y est enregistré. Une panne réseau ne supprime plus la session. Le bouton « Me déconnecter » efface la connexion mémorisée et les données affichées. Les notifications simples qui étaient silencieuses sous React Native Web sont maintenant visibles.

Test navigateur reproductible sans données réelles : après `npm run build:web`, lancer `NODE_ENV=test node server/test-fixtures/preview-payments.cjs`, ouvrir l’adresse locale affichée, puis choisir un scénario. Le serveur de test n’utilise aucune configuration `.env` et interdit le réseau fournisseur ; seuls des fichiers temporaires sont modifiés. Ne pas utiliser ce dispositif avec une base ou des clés de production.

Une commande annulée ne peut plus être réactivée par une action de service ou un retour tardif de paiement. Ses points, son bonus de parrainage et son cadeau de bienvenue suivent les règles d’annulation. La vérification client distingue erreur réseau, refus, expiration et annulation, au lieu d’afficher un succès pour une commande annulée.

**Annuler n’effectue aucun remboursement bancaire.** Pour l’instant, annuler la commande dans l’espace restaurant ET effectuer son remboursement dans SumUp. Les remboursements faits uniquement dans SumUp ne sont pas encore synchronisés automatiquement ; cette étape reste à développer à partir des [transactions et événements de remboursement](https://developer.sumup.com/api/transactions). Aucun appel de remboursement n’est implémenté dans cette version.

Le stockage JSON sérialise maintenant les opérations de lecture/modification/écriture, avec remplacement atomique du fichier, pour éviter qu’une confirmation de paiement écrase une annulation ou une modification de compte simultanée. Les appels externes dans cette section sont limités à 10 secondes. Cela reste une architecture **mono-processus** : ne pas lancer plusieurs instances serveur sur ce fichier ; utiliser une base transactionnelle avant de monter en charge. Ces protections ne remplacent pas les sauvegardes.

Les tests HTTP de paiement utilisent un faux fournisseur dans un processus isolé, sans clés réelles, encaissement ou SMS.

## Préparation des stores

La configuration Expo/EAS est prête dans `app.json` et `eas.json`, avec l’identifiant `com.bibouandco.bibousburgers`. Les builds de production se lancent avec `npm run build:production` après connexion à un compte Expo et aux comptes développeur Apple/Google.

Voir `RELEASE_READINESS.md` pour distinguer les contrôles effectués, les exports JavaScript et les vrais binaires signés restant à créer. `.easignore` exclut les données serveur, les sauvegardes et les secrets des envois mobiles. L’image serveur exclut également les fichiers de données locaux et démarre avec une base vide si aucun fichier persistant n’existe : elle ne copie jamais des clients de développement.

Les réponses JSON portent `Cache-Control: no-store` et `X-Content-Type-Options: nosniff`. L’accès restaurant limite dix essais sur cinq minutes par adresse de connexion (potentiellement partagée derrière le proxy), avec délai `Retry-After` ; une réussite réinitialise les essais. La vérification SMS limite huit codes essayés par numéro sur quinze minutes, en plus de la limite existante de trois envois réussis. Ces compteurs et les sessions restaurant restent en mémoire : ils ne constituent pas une protection distribuée ni une garantie de plafond de facturation SMS. Ne pas faire de tests de force brute sur la production.

L’override ciblé `xcode > uuid = 11.1.1` corrige l’alerte [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) sans rétrograder Expo. Le générateur d’identifiants Xcode reste vérifié ; l’audit npm n’indique plus de vulnérabilité connue à la date du contrôle. Cela ne remplace pas une revue de sécurité du produit.

- Politique de confidentialité : `https://bibous-burger-app.onrender.com/?legal=privacy`
- Suppression de compte : `https://bibous-burger-app.onrender.com/?legal=delete-account`
