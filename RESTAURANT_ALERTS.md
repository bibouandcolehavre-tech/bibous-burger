# Alertes commandes renforcées — 24 septembre 2026

## Comportement

- Les commandes `confirmed` avec paiement `PAID` déclenchent une alerte, y compris au premier chargement du tableau. Les paiements en attente, échecs, commandes acceptées/terminées/annulées ne déclenchent pas cette boucle.
- Carillon plus présent, répété toutes les 8 secondes avec une pause entre motifs. Boucle Web Audio sur l’horloge audio, pas sur une minuterie JavaScript susceptible d’être ralentie en arrière-plan. Un seul lecteur, sans accumulation aux actualisations.
- Volume local réglable de 10 à 100 %, valeur par défaut 85 %. Le volume système/la sortie audio ou un onglet muet restent hors du contrôle de l’application.
- Activation depuis le clic de connexion ou le premier geste dans le tableau (si non explicitement coupé). Avertissement orange visible tant que le contexte audio n’est pas prêt. Bouton de test fini, sans créer de commande.
- Bandeau rouge persistant et bouton vers les nouvelles commandes. Pause sonore d’une minute, reprise automatique ; toute nouvelle commande interrompt cette pause. Le bouton ne change jamais le statut de commande.
- Arrêt uniquement après acceptation/annulation confirmée par le serveur, pas au clic optimiste. Une erreur d’enregistrement conserve la sonnerie. Déconnexion/expiration de session arrête les lecteurs et efface les alertes locales.
- Alertes ponctuelles réservations et récompenses conservées ; pas de superposition avec le carillon de commandes.
- Le tableau doit rester ouvert, l’ordinateur éveillé et audible. Une page fermée, un navigateur suspendu ou un Mac en veille ne peuvent pas garantir une alerte. Garder un seul onglet restaurant pour éviter un doublon.

## Contrôles

- 229 tests réussis. Nouveaux cas : première liste non vide, répétition sans timers JS, signal PCM sans saturation, volume/arrêt, pause/expiration/nouvelle arrivée, échec de sauvegarde, contexte suspendu et activation sans neutraliser la coupure volontaire.
- Test navigateur sur tableau local isolé : activation à la connexion, commande #901 déjà présente, pause, arrivée de #902 relançant le son, acceptation de #901 conservant l’alerte de #902, dernière acceptation masquant l’alerte. Aucune erreur console.
- Affichage mobile contrôlé ; aucun statut de commande réelle modifié. La capacité à entendre physiquement les haut-parleurs doit être confirmée par l’équipe avec « Tester le son ».
- Déploiement : à confirmer.
