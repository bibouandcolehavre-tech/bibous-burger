# Gestionnaire multi-restaurants — proposition du 24 septembre 2026

Statut : conception uniquement, aucune modification du service Bibou's en production.

## Objectif

Permettre au propriétaire de la future plateforme de suivre plusieurs restaurants,
de personnaliser leurs interfaces et de choisir leurs modules. Chaque restaurateur
conserve son propre espace, ses commandes, ses clients et ses paiements.

## Première version proposée

- Liste des restaurants : nom, état de mise en service, modules actifs, santé de la connexion.
- Fiche restaurant : identité visuelle, contacts, horaires, zones et frais de livraison.
- Modules : catalogue et commandes, retrait, livraison, réservation de tables,
  fidélité, parrainage, abonnement client, avis Google et notifications/marketing.
- Accès nominatifs : administrateur plateforme, propriétaire restaurant et personnel.
- Historique des changements : auteur, restaurant concerné, ancienne/nouvelle valeur, date.
- Aperçu des changements avant publication. Aucune commande fictive dans les statistiques réelles.

Un module désactivé doit être bloqué côté serveur, pas seulement masqué dans l'écran.
On ne coupe pas le traitement d'une commande, réservation ou prestation déjà payée :
la désactivation ferme les nouvelles demandes mais laisse terminer les engagements en cours.
Les dépendances entre modules doivent être explicites (abonnement avec livraison, par exemple).
Activer le module notifications ne vaut jamais consentement publicitaire des clients.

## Séparation indispensable

Le serveur actuel lit un fichier JSON et une configuration globale pour un restaurant.
Un simple champ `restaurantId` ajouté à l'interface ne rendrait pas ce système multi-restaurants.

Proposition initiale : un gestionnaire central, un socle de code commun et des environnements
opérationnels isolés par restaurant. Les coûts d'hébergement supplémentaires devront être
présentés et validés avant toute création. Une base partagée avec cloisonnement par locataire
pourrait être étudiée plus tard ; aucune migration automatique de Bibou's n'est prévue ici.

- Le serveur détermine le restaurant depuis l'identité authentifiée et les accès accordés,
  jamais depuis un identifiant client non vérifié.
- Les comptes de paiement, clés SMS, push et avis sont propres au restaurant ; aucune clé
  de Bibou's n'est réutilisée pour un futur client.
- Les événements de paiement sont rattachés au bon marchand avant toute validation.
- Aucun export, recherche, sauvegarde, total de ventes ou destinataire push ne doit traverser
  la limite entre deux restaurants sans droit explicitement défini.
- L'administrateur plateforme ne voit pas par défaut les données personnelles des clients.
  Tout accès de support doit être limité, justifié et tracé.
- La gestion commerciale des abonnements payés par les restaurants reste distincte de Bibou +,
  qui est l'abonnement des consommateurs.

## Étapes sans risque pour Bibou's

1. Maquette séparée du gestionnaire, avec deux restaurants fictifs et des modules simulés.
2. Définition des rôles, des dépendances entre modules et des règles de désactivation.
3. Environnement de test isolé, comptes nominatifs et contrôles d'accès côté serveur.
4. Tests de non-accès croisé avec deux restaurants, y compris paiements, sauvegardes et push.
5. Premier pilote consenti, puis mise en service après vérification des coûts et contrats.

## Décisions restant à prendre

- Une application sous la marque de chaque restaurant ou une application commune ? Cela
  change les identifiants mobiles, les comptes boutiques, les notifications et la maintenance.
- Nom commercial de la plateforme, tarifs de vente et responsabilité du support.
- Hébergement et propriété des comptes fournisseurs : transparence sur les coûts récurrents.

La prochaine livraison raisonnable est la maquette isolée du gestionnaire, pas une migration
immédiate de l'application Bibou's ni une promesse que la plateforme est déjà commercialisable.
