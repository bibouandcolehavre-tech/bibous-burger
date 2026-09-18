# Point de reprise — 18 septembre 2026

Ce document sert de point de reprise pour le développement de l’application Bibou's Burgers.

## Version actuellement publiée

- Application client : https://bibous-burger-app.onrender.com/?v=4f5f2c1
- Espace restaurant : https://bibous-burgers-restaurant.onrender.com/
- API : https://bibous-burger.onrender.com/api
- Dernière version du code : `4f5f2c1` (`Restore full-width category headers`)

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
- Bibou + à 9,99 € pour 30 jours : livraison offerte, remise de 5 % et points doublés.
- Politique de confidentialité et suppression de compte.
- Configuration Expo/EAS préparée pour iOS et Android.
- 43 tests automatisés réussissent.

## Prochaines priorités recommandées

1. Retester l’envoi d’un SMS vers un numéro réel non vérifié après l’approbation Twilio.
2. Rendre les récompenses fidélité réellement échangeables et déduire les points utilisés.
3. Terminer l’espace restaurant : disponibilité des produits, modification de la carte et gestion de la fidélité clients.
4. Ajouter une vraie notification sonore pour les nouvelles commandes et réservations.
5. Fiabiliser la confirmation des paiements et la gestion des remboursements SumUp.
6. Ajouter des sauvegardes automatiques des données de production.
7. Générer une première version installable iPhone/Android et effectuer un test complet sur appareils réels.
8. Préparer les captures d’écran, les informations légales finales et les fiches Apple App Store et Google Play.

## Précautions

- Ne jamais publier les clés SumUp, Twilio, Google ou les mots de passe dans Git.
- Ne pas ajouter `server/data.json` à un commit : il peut contenir des données locales de test ou de clients.
- Les données de production sont conservées sur le disque persistant du service Render et ne doivent pas être remplacées par le fichier local.

