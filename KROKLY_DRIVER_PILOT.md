# Krokly Driver — pilote Bibou (préparé localement)

Statut au 7 octobre 2026 : code local testé, **non publié**, aucun compte livreur réel créé, aucune commande réelle attribuée. Le propriétaire souhaite un premier essai Bibou avec Mathieu, sous surveillance du restaurant, après mise en service. Ne pas transmettre l'adresse locale `127.0.0.1` à un livreur : elle ne fonctionne que sur l'ordinateur de développement.

## Parcours prévu

1. Le restaurateur ouvre `/driver/` sur le service Bibou, choisit « Je répartis les courses » et se connecte avec le mot de passe actuel du back-office. Il crée un compte distinct par livreur ; le serveur génère un mot de passe long, affiché une seule fois. Le restaurateur le remet lui-même au livreur par un canal privé.
2. Le livreur ouvre la même adresse, choisit « Je suis livreur » et utilise son identifiant et son mot de passe. Il ne voit que ses courses. Avant acceptation, l'adresse complète et le téléphone du client ne sont pas transmis.
3. Une commande de livraison du jour, payée, marquée prête et non confiée à Uber Direct peut être proposée à un livreur choisi. Une offre sans réponse expire après cinq minutes et redevient attribuable. Le livreur peut accepter ou refuser.
4. « J'ai récupéré le repas » passe la commande Bibou en livraison ; « Livraison effectuée » la marque livrée. Les notifications de suivi client déjà prévues par Bibou sont alors mises en file selon leur configuration existante. Les modifications concurrentes du back-office sont bloquées pour les courses actives.
5. Le restaurant peut désactiver un compte ou remplacer son mot de passe. Cela invalide ses sessions en cours. Les mots de passe sont hachés dans la base ; les jetons de session expirent après douze heures.

## Alertes iPhone

Le code Web Push est préparé : abonnement volontaire par le livreur, notification générique sans adresse ni téléphone du client sur l'écran verrouillé, test différé de quinze secondes, file persistante et suppression des abonnements invalides. La clé VAPID est dérivée de la clé de session aléatoire persistante `SESSION_SECRET` déjà présente sur le service Bibou (au moins 32 octets) ; une clé dédiée `KROKLY_VAPID_PRIVATE_KEY` peut la remplacer ultérieurement, mais son remplacement impose un nouvel abonnement des téléphones. Sur iPhone, le livreur doit ajouter le lien HTTPS Krokly à son écran d'accueil, ouvrir cette icône, se connecter, puis appuyer sur « Activer les alertes » et accepter la demande iOS. Le futur domaine Krokly sera une nouvelle origine : il faudra réinstaller l'icône et se réabonner aux notifications.

**Le code et les tests simulés ne prouvent pas la réception sur un iPhone verrouillé.** Avant de compter sur cette alerte, envoyer l'alerte test depuis le téléphone de Mathieu, le verrouiller pendant les quinze secondes d'attente, puis confirmer sa réception. Même après une réception réussie, le restaurant doit surveiller les courses dans son espace pendant ce pilote : iOS, le réseau et le mode Concentration peuvent empêcher ou retarder une notification.

## Vérifications réalisées

Tests sur fausses commandes et serveur local : deux livreurs distincts ; refus d'accès croisé ; attribution unique ; commande du jour uniquement ; refus d'une commande Uber active ; enchaînement strict des étapes ; expiration de l'offre ; révocation de session ; paquet Docker complet. Les tests VAPID vérifient la signature, le blocage des destinations arbitraires, la file d'envoi et la révocation. La suite Bibou complète passe (430 tests au dernier passage). Connexion restaurant et livreur vérifiée dans l'interface locale. Aucun paiement ni envoi à un client réel.

## Conditions avant partage du lien avec un vrai livreur

- Vérifier le déploiement exact du code sur le service Bibou et le certificat HTTPS. Préparer une adresse provisoire sur le service existant, sans modifier `bibousburgers.com` ni le QR code ; un futur domaine Krokly pourra pointer vers le service plus tard.
- Vérifier que `SESSION_SECRET` active la clé VAPID dans la réponse authentifiée `/api/krokly-driver/state`. Créer le compte réel « Mathieu » / `mathieu` seulement sur le serveur de production, puis lui communiquer son mot de passe unique en privé. Le compte fictif local utilisé pour vérifier les permissions ne remplit pas cette étape.
- Faire un essai de notification sur l'iPhone verrouillé de Mathieu et un essai de commande contrôlé sous la surveillance du restaurant, sans facturer un vrai client dans un test artificiel. En cas d'alerte absente, utiliser le back-office comme filet de sécurité et corriger avant de déclarer les alertes fiables.
- Ajouter une procédure d'incident, de réattribution après acceptation, d'annulation pendant le trajet et de preuve de remise avant usage opérationnel autonome.
- Lors d'une extension à Spud Bencer, mettre en place la séparation des restaurants et des paiements côté serveur ; ce pilote est limité à Bibou. Ne pas l'utiliser pour un autre établissement en remplaçant seulement le logo ou le nom.

Les fichiers du pilote sont `driver-app/` et `server/krokly-drivers.js`, raccordés dans `server/server.js`. Le serveur de production ne voit pas ces fichiers tant qu'ils ne sont pas publiés. Aucun achat de domaine Krokly n'est nécessaire pour poursuivre les tests de développement.
