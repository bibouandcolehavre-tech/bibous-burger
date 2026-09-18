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

## Préparation des stores

La configuration Expo/EAS est prête dans `app.json` et `eas.json`, avec l’identifiant `com.bibouandco.bibousburgers`. Les builds de production se lancent avec `npm run build:production` après connexion à un compte Expo et aux comptes développeur Apple/Google.

- Politique de confidentialité : `https://bibous-burger-app.onrender.com/?legal=privacy`
- Suppression de compte : `https://bibous-burger-app.onrender.com/?legal=delete-account`
