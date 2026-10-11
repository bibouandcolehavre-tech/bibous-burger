# Krokli Driver — pilote Bibou

Mise à jour du 11 octobre 2026 : première PWA Krokli Driver préparée dans un clone isolé, à partir de `main` (`2a82b48`). **Cette mise à jour n’a pas été publiée par cette intervention** ; aucun compte livreur réel créé, aucune commande réelle attribuée ou modifiée. Le pilote existant avait déjà un manifest, un service worker, des comptes distincts et les étapes de livraison côté serveur. Cette révision complète l’installation mobile, les icônes et la charte vert `#315b4b`, orange `#bb7258`, crème `#fbf3e6`.

Le propriétaire souhaite un premier essai Bibou avec Mathieu, sous surveillance du restaurant. L’origine publique documentée du service est `https://bibous-burger-app.onrender.com` : le chemin du pilote est `/driver/`, soit `https://bibous-burger-app.onrender.com/driver/`. Vérifier la version effectivement servie avant de partager le lien. Ne pas transmettre l’adresse locale `127.0.0.1` à un livreur : elle ne fonctionne que sur l’ordinateur de développement.

## Installer sur le téléphone

L’aide « Installer Krokli Driver sur mon téléphone » est disponible avant comme après connexion.

- **iPhone/iPad** : ouvrir le lien HTTPS dans Safari, utiliser Partager → Sur l’écran d’accueil, activer « Ouvrir comme app web » si proposé, puis Ajouter. Ouvrir la nouvelle icône Krokli Driver et se connecter avec son compte personnel. L’icône Apple est fournie en PNG 180 × 180.
- **Android** : ouvrir le lien dans Chrome, utiliser le bouton d’installation si le navigateur le propose, ou son menu ⋮ → Installer et créer un raccourci → Installer. Le libellé peut aussi être « Ajouter à l’écran d’accueil ». Les icônes PNG 192 × 192 et 512 × 512 ont une zone de sécurité pour les formes Android.
- **Lien ouvert dans une messagerie** : utiliser d’abord « Ouvrir dans Safari/Chrome ». Une nouvelle connexion peut être nécessaire entre le navigateur et l’icône installée.

La demande d’installation utilise seulement l’invitation du navigateur lorsqu’il la fournit. Aucune installation n’est annoncée comme réussie avant le retour du navigateur. Les instructions suivent [l’aide Apple](https://support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios) et [l’aide Chrome Android](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=fr).

## Connexion et confidentialité

Seul le shell public de l’application (page, script, styles, icônes et manifest) est stocké pour pouvoir afficher l’aide et la connexion lors d’une coupure. Le service worker exclut toutes les API, les requêtes authentifiées, les paramètres d’URL et les routes non explicitement publiques. Les réponses privées restent `Cache-Control: no-store` côté serveur, avec `cache: 'no-store'` côté navigateur. Les adresses, téléphones et courses ne sont pas enregistrés dans Cache Storage ou le stockage local ; celui-ci conserve la session existante et le choix de rôle.

Les courses demandent Internet. Une coupure rend immédiatement les actions indisponibles. Les dernières courses affichées en mémoire ne sont pas une preuve de leur état actuel. Au retour du réseau ou dans une page restaurée, les actions attendent une réponse serveur vérifiée ; une mutation dont la réponse est perdue reste à vérifier par actualisation. Aucune étape n’est mise en file hors ligne et aucun succès de livraison n’est inventé.

Le nom affiché est **Krokli Driver**, avec un i. Les routes, clés de stockage et noms de modules historiques `krokly-*` sont conservés pour la compatibilité des comptes et sessions existants.

## Parcours prévu

1. Le restaurateur ouvre `/driver/` sur le service Bibou, choisit « Je répartis les courses » et se connecte avec le mot de passe actuel du back-office. Il crée un compte distinct par livreur ; le serveur génère un mot de passe long, affiché une seule fois. Le restaurateur le remet lui-même au livreur par un canal privé.
2. Le livreur ouvre la même adresse, choisit « Je suis livreur » et utilise son identifiant et son mot de passe. Il ne voit que ses courses. Avant acceptation, l'adresse complète et le téléphone du client ne sont pas transmis.
3. Une commande de livraison du jour, payée, marquée prête et non confiée à Uber Direct peut être proposée à un livreur choisi. Une offre sans réponse expire après cinq minutes et redevient attribuable. Le livreur peut accepter ou refuser.
4. « J'ai récupéré le repas » passe la commande Bibou en livraison ; « Livraison effectuée » la marque livrée. Les notifications de suivi client déjà prévues par Bibou sont alors mises en file selon leur configuration existante. Les modifications concurrentes du back-office sont bloquées pour les courses actives.
5. Le restaurant peut désactiver un compte ou remplacer son mot de passe. Cela invalide ses sessions en cours. Les mots de passe sont hachés dans la base ; les jetons de session expirent après douze heures.

## Alertes iPhone

Le code Web Push est préparé : abonnement volontaire par le livreur, notification générique sans adresse ni téléphone du client sur l'écran verrouillé, test différé de quinze secondes, file persistante et suppression des abonnements invalides. La clé VAPID est dérivée de la clé de session aléatoire persistante `SESSION_SECRET` déjà présente sur le service Bibou (au moins 32 octets) ; une clé dédiée `KROKLY_VAPID_PRIVATE_KEY` peut la remplacer ultérieurement, mais son remplacement impose un nouvel abonnement des téléphones. Sur iPhone, le livreur doit ajouter le lien HTTPS Krokli à son écran d'accueil, ouvrir cette icône, se connecter, puis appuyer sur « Activer les alertes » et accepter la demande iOS. Le futur domaine Krokli sera une nouvelle origine : il faudra réinstaller l'icône et se réabonner aux notifications.

**Le code et les tests simulés ne prouvent pas la réception sur un iPhone verrouillé.** Avant de compter sur cette alerte, envoyer l'alerte test depuis le téléphone de Mathieu, le verrouiller pendant les quinze secondes d'attente, puis confirmer sa réception. Même après une réception réussie, le restaurant doit surveiller les courses dans son espace pendant ce pilote : iOS, le réseau et le mode Concentration peuvent empêcher ou retarder une notification.

## Vérifications réalisées

Tests sur fausses commandes et serveur local : deux livreurs distincts ; refus d'accès croisé ; attribution unique ; commande du jour uniquement ; refus d'une commande Uber active ; enchaînement strict des étapes ; expiration de l'offre ; révocation de session ; paquet Docker complet. Les tests VAPID vérifient la signature, le blocage des destinations arbitraires, la file d'envoi et la révocation. La suite Bibou complète passe (530 tests au passage du 11 octobre 2026). Les tests couvrent aussi les icônes réellement servies et empaquetées, la coupure/reprise réseau, la restauration d’une page, les invitations d’installation et l’exclusion des requêtes privées du cache. Connexion livreur, courses limitées au bon compte, adresse révélée après acceptation serveur et affichage à 390 × 844 / 1280 × 900 vérifiés dans le navigateur sur des données fictives. Aucun paiement ni envoi à un client réel.

## Conditions avant partage du lien avec un vrai livreur

- Vérifier le déploiement exact du code sur le service Bibou et le certificat HTTPS. Préparer une adresse provisoire sur le service existant, sans modifier `bibousburgers.com` ni le QR code ; un futur domaine Krokli pourra pointer vers le service plus tard.
- Vérifier que `SESSION_SECRET` active la clé VAPID dans la réponse authentifiée `/api/krokly-driver/state`. Créer le compte réel « Mathieu » / `mathieu` seulement sur le serveur de production, puis lui communiquer son mot de passe unique en privé. Le compte fictif local utilisé pour vérifier les permissions ne remplit pas cette étape.
- Faire un essai de notification sur l'iPhone verrouillé de Mathieu et un essai de commande contrôlé sous la surveillance du restaurant, sans facturer un vrai client dans un test artificiel. En cas d'alerte absente, utiliser le back-office comme filet de sécurité et corriger avant de déclarer les alertes fiables.
- Ajouter une procédure d'incident, de réattribution après acceptation, d'annulation pendant le trajet et de preuve de remise avant usage opérationnel autonome.
- Lors d'une extension à Spud Bencer, mettre en place la séparation des restaurants et des paiements côté serveur ; ce pilote est limité à Bibou. Ne pas l'utiliser pour un autre établissement en remplaçant seulement le logo ou le nom.

Les fichiers du pilote sont `driver-app/` et `server/krokly-drivers.js`, raccordés dans `server/server.js`. Cette révision doit être intégrée puis publiée pour que ses améliorations d’installation et de connexion soient disponibles sur le service. Aucun achat de domaine Krokli n'est nécessaire pour poursuivre les tests de développement.
