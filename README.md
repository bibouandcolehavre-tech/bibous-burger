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

1. Installer les dépendances avec `npm install`.
2. Lancer l’API avec `npm run server`.
3. Lancer l’application avec `npm start`.

Les secrets SumUp, Twilio, Google, le mot de passe restaurant et la clé de session restent uniquement dans les variables d’environnement du serveur.

## Disponibilité des produits

Dans l’espace restaurant, « Carte & disponibilité » permet de chercher un produit, de filtrer les ruptures et de le rendre disponible ou indisponible. Les prix ne changent pas. Les burgers seuls et leurs menus se règlent séparément.

Les boissons et accompagnements en rupture sont aussi bloqués dans les options. Les menus incluant des frites sont bloqués si les frites maison sont en rupture ; le Menu Duo dépend également des tenders. Le client se rafraîchit toutes les 15 secondes lorsqu’il est connecté, ainsi qu’au retour dans l’application. Son panier est revérifié avant la commande puis côté serveur avant la création du lien SumUp. Un lien SumUp déjà émis n’est pas révoqué par un changement de disponibilité ; les commandes déjà payées restent à traiter.

Les choix persistent dans `product-stock.json`, à côté de `DATA_FILE_PATH` (donc `/var/data/product-stock.json` sur Render). Ce fichier est distinct des commandes et clients, ignoré par Git, et doit être inclus dans les sauvegardes du disque. Il ne faut pas le remplacer au déploiement. En l’absence du fichier, les disponibilités initiales du catalogue sont utilisées ; une erreur de lecture bloque les validations au lieu de rouvrir tous les produits.

`npm test` couvre les droits d’accès, les ruptures, les options, la persistance, les écritures concurrentes et les blocages de commande/paiement avec des données temporaires, sans appel SumUp ou SMS.

## Alertes du restaurant

Au début du service, ouvrir l’espace restaurant, se connecter puis cliquer sur « Activer le son ». Un court carillon confirme l’activation ; « Tester le son » permet de vérifier le volume et la sortie audio. « Couper le son » conserve tous les indicateurs visuels. Le choix silencieux est mémorisé, mais un rechargement peut demander une nouvelle activation du son dans le navigateur.

Le tableau vérifie les demandes toutes les 10 secondes et au retour au premier plan. Une nouvelle commande ne déclenche une alerte que si elle est payée et encore à accepter. Les réservations en attente et récompenses à remettre ont également leur son. Le premier chargement reste silencieux, les compteurs affichent déjà les demandes existantes. Chaque demande ne sonne qu’une fois par session de page, même après une réponse vide ou une reconnexion. Les arrivées reçues pendant le mode silencieux ne sont pas rejouées ensuite.

Les trois compteurs permettent d’ouvrir la rubrique correspondante ; le nombre total apparaît aussi dans le titre de l’onglet. Un indicateur signale une perte de connexion, une actualisation échouée ou des données trop anciennes. Une session expirée demande une reconnexion.

Ce sont des alertes **dans la page**, pas des notifications push : garder le tableau ouvert, le Mac éveillé et le volume audible. Utiliser un seul onglet pour éviter les sons en double. Le navigateur peut ralentir les onglets en arrière-plan : garder le tableau au premier plan pendant le service.

`server/dashboard-alerts.test.js` vérifie les arrivées, paiements, doublons, erreurs réseau, reprise, mode silencieux et génération des sons, avec un contrôleur de tableau et des données simulés.

## Préparation des stores

La configuration Expo/EAS est prête dans `app.json` et `eas.json`, avec l’identifiant `com.bibouandco.bibousburgers`. Les builds de production se lancent avec `npm run build:production` après connexion à un compte Expo et aux comptes développeur Apple/Google.

- Politique de confidentialité : `https://bibous-burger-app.onrender.com/?legal=privacy`
- Suppression de compte : `https://bibous-burger-app.onrender.com/?legal=delete-account`
