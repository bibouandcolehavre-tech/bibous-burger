# Console partenaires — prototype local uniquement

Lancer depuis la racine du dépôt : `node partner-console/server.cjs`, puis ouvrir `http://127.0.0.1:4176/`.

Cette interface n'est ni le tableau de bord Bibou's, ni une console de production. Elle ne contient aucune clé, compte client, commande ou connexion fournisseur. Le serveur n'écoute que l'interface locale et ne sert que quatre fichiers publics ; toute connexion API depuis la page est bloquée par sa politique de sécurité.

## Fonctionnalités de l'essai

- Deux établissements fictifs, recherche et ajout de fiches fictives (20 au maximum).
- Neuf modules, activation de leurs dépendances et désactivation des modules dépendants.
- Identité simple : nom, ville, cuisine et cinq couleurs.
- Aperçu client simulé, indépendant du vrai parcours de commande.
- Récapitulatif avant enregistrement, historique des 100 derniers changements.
- Sauvegarde dans ce navigateur seulement. Les brouillons sont conservés en mémoire en changeant d'établissement ; recharger la page les perd, après avertissement.
- Contrôle de révision et verrou Web Locks lorsque disponible pour éviter l'écrasement d'un changement dans un autre onglet. Un brouillon périmé reste visible mais ne peut pas écraser la nouvelle fiche ; recharger pour repartir de la sauvegarde.
- `?session=verification` ouvre une session éphémère pour les contrôles sans modifier la sauvegarde du propriétaire.

Ne pas saisir de données personnelles ou de clés. Le stockage local n'est pas une base sécurisée. Il n'y a pas d'authentification, de publication de modules ni de déploiement depuis cette maquette. Les droits par restaurant et contrôles d'accès côté serveur restent à construire dans un environnement isolé. Voir `MULTI_RESTAURANT_PLAN.md`.
