# Fiche de publication — Bibou's Burgers

## Identité

- Nom : **Bibou's Burgers**
- Sous-titre App Store : **Burgers, livraison, fidélité**
- Catégorie principale : **Cuisine et boissons**
- Identifiant iOS : `com.bibouandco.bibousburgers`
- Identifiant Android : `com.krokly.bibousburgers` (identique à la fiche Google Play existante)
- Version de départ : `1.0.0`
- Public : clients du restaurant au Havre et dans un rayon de 5 km

## Description courte Google Play

Commandez vos burgers, choisissez votre créneau et profitez de la fidélité.

## Description complète

Bienvenue chez Bibou's Burgers, l'application officielle de Bibou & Co au Havre.

Commandez nos burgers faits maison en quelques instants, personnalisez votre recette et choisissez le service qui vous convient : livraison dans notre zone ou Click & Collect au restaurant.

Avec l'application, vous pouvez :

- découvrir nos menus, burgers seuls, petites faims et boissons ;
- personnaliser votre burger et ses accompagnements ;
- recevoir des suggestions utiles avant de terminer le panier ;
- choisir un créneau de livraison ou de retrait ;
- payer de façon sécurisée avec SumUp ;
- suivre l'avancement de votre commande ;
- réserver une table jusqu'à quatre personnes ;
- cumuler des points et débloquer des récompenses ;
- parrainer vos proches ;
- consulter les avis Google de Bibou's Burgers.

Bibou + est proposé à 9,99 € pour une période de 30 jours. Il offre la livraison, 5 % de remise sur les produits et le doublement des points fidélité. Il n'y a aucun renouvellement automatique : le client choisit lui-même s'il souhaite prolonger.

La livraison est disponible dans un rayon de 5 km autour du 153 quai Georges V, 76600 Le Havre. Les horaires et créneaux disponibles sont affichés directement dans l'application.

## Mots-clés App Store

burger,restaurant,livraison,le havre,click collect,fidélité,réservation,repas

## Liens publics

- Site et assistance : https://bibous-burger-app.onrender.com/
- Politique de confidentialité : https://bibous-burger-app.onrender.com/?legal=privacy
- Suppression du compte : https://bibous-burger-app.onrender.com/?legal=delete-account

## Notes pour l'équipe de vérification

Bibou's Burgers vend exclusivement des repas, leur livraison et des avantages liés à ces achats physiques. Aucun contenu numérique n'est vendu. Les commandes et Bibou + sont payés sur la page sécurisée de SumUp. Bibou + est une période de 30 jours renouvelée uniquement à la demande du client, sans débit automatique.

La consultation de la carte, des tarifs, des avis Google, de la fidélité et des informations légales est possible sans compte. Une connexion par code SMS est demandée avant une commande ou une réservation afin de sécuriser les coordonnées du client.

Accès isolé approuvé par le propriétaire le 24 septembre 2026 : depuis « Mon compte », choisir « Accès de vérification des boutiques » puis entrer le code privé fourni dans Play Console. Aucun numéro ni SMS requis. Cet accès ouvre une session fictive séparée des clients réels. Le code n'est pas dans le dépôt ni dans l'application ; seul son vérificateur est côté serveur.

Le bandeau MODE DE TEST reste visible. Les comptes, points de départ, paiements, réservations et commandes y sont fictifs. Aucun appel à SumUp/Twilio, aucun encaissement, aucun push, aucune transmission au restaurant. Les créneaux du catalogue sont consultables ; le test ne réserve pas de capacité réelle. Les sessions expirent après 24 heures ou au redémarrage du serveur ; le même code permet d'en ouvrir une nouvelle. Ne jamais présenter cette simulation comme un paiement réel réussi. L'accès client ordinaire reste protégé par SMS et conserve les véritables parcours de paiement.

Code à renseigner uniquement dans la rubrique privée « Informations de connexion » de Google Play ; ne pas l'ajouter à la description publique. Guide technique : `STORE_REVIEW_ACCESS.md`.

Le paiement SumUp est conforme au principe des achats physiques : Apple demande une méthode autre que l'achat intégré pour les biens ou services physiques consommés hors de l'application, et Google Play exclut notamment la nourriture et la livraison de son système de facturation numérique.

- Apple : https://developer.apple.com/app-store/review/guidelines/#goods-and-services-outside-of-the-app
- Google Play : https://support.google.com/googleplay/android-developer/answer/9858738

## Déclaration de confidentialité — brouillon

### Données collectées

- nom et numéro de téléphone ;
- adresse de livraison ;
- identifiant interne du compte ;
- commandes, réservations et statut de paiement ;
- solde de fidélité, parrainage et statut Bibou +.
- jour et mois d'anniversaire facultatifs, consentement aux offres personnalisées ;
- identifiants techniques de notification/appareil et choix de notification, si activés.

### Finalités

- fonctionnement de l'application et gestion du compte ;
- authentification et prévention de la fraude ;
- préparation, paiement, livraison et suivi des commandes ;
- réservation de table et assistance client ;
- fidélité et avantages commerciaux.

### Partenaires

- Twilio : envoi du code de connexion SMS ;
- SumUp : paiement par carte, sans transmission du numéro complet de carte à Bibou & Co ;
- Google : calcul de la distance de livraison et affichage d'avis publics.
- Expo, Google FCM et Apple : acheminement des notifications, sur consentement séparé.

L'application n'intègre ni publicité ni suivi publicitaire et ne vend pas les données personnelles.

## Éléments graphiques à fournir aux boutiques

- icône 1024 × 1024 : prête dans `assets/icon.png` ;
- icône Android adaptative : prête dans `assets/adaptive-icon.png` ;
- captures d'écran téléphone : accueil, produit, créneaux, fidélité, Bibou +, réservation et suivi ;
- visuel promotionnel Google Play : à créer à partir de l'identité vermillon, crème et noire.

## Dernières actions qui nécessitent le propriétaire des comptes

1. Posséder ou créer les comptes Apple Developer et Google Play Console.
2. Se connecter à Expo/EAS et autoriser la création des certificats de signature.
3. Créer les fiches de l'application dans les deux boutiques, puis reprendre les textes ci-dessus.
4. Fournir les déclarations légales demandées aux titulaires des comptes et valider les contrats des boutiques.
5. Ajouter les captures d'écran finales, envoyer les builds et lancer la vérification.
