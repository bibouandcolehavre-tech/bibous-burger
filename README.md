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
- programme fidélité, parrainage, prestiges et récompenses ;
- Bibou + : livraison offerte, remise de 5 % et points doublés pendant 30 jours ;
- cadeau de bienvenue de 10 % sur la première commande ;
- réservation de table jusqu’à quatre personnes ;
- avis Google, politique de confidentialité et suppression de compte.

## Développement local

1. Installer les dépendances avec `npm install`.
2. Lancer l’API avec `npm run server`.
3. Lancer l’application avec `npm start`.

Les secrets SumUp, Twilio, Google, le mot de passe restaurant et la clé de session restent uniquement dans les variables d’environnement du serveur.

## Préparation des stores

La configuration Expo/EAS est prête dans `app.json` et `eas.json`, avec l’identifiant `com.bibouandco.bibousburgers`. Les builds de production se lancent avec `npm run build:production` après connexion à un compte Expo et aux comptes développeur Apple/Google.

- Politique de confidentialité : `https://bibous-burger-app.onrender.com/?legal=privacy`
- Suppression de compte : `https://bibous-burger-app.onrender.com/?legal=delete-account`
