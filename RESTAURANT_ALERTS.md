# Alertes commandes renforcées — 24 septembre 2026

## Comportement

- Les commandes `confirmed` avec paiement `PAID` déclenchent une alerte, y compris au premier chargement du tableau. Les paiements en attente, échecs, commandes acceptées/terminées/annulées ne déclenchent pas cette boucle.
- Carillon plus présent, répété toutes les 8 secondes avec une pause entre motifs. Boucle Web Audio sur l’horloge audio, pas sur une minuterie JavaScript susceptible d’être ralentie en arrière-plan. Un seul lecteur, sans accumulation aux actualisations.
- Volume local réglable de 10 à 100 %, valeur par défaut 85 %. Le volume système/la sortie audio ou un onglet muet restent hors du contrôle de l’application.
- Activation depuis le clic de connexion ou le premier geste dans le tableau. L’ancien réglage local `bibous-restaurant-sound=off` est ignoré. Avertissement orange visible tant que le contexte audio n’est pas prêt. Bouton de test fini, sans créer de commande ; ne coupe pas la sonnerie si une commande attend déjà.
- Bandeau rouge persistant et bouton vers les nouvelles commandes. À la demande du propriétaire, aucun bouton muet ou pause temporaire : la boucle reste active tant qu’une commande payée attend une réponse et que le navigateur autorise le son. Le bouton d’activation est à sens unique, jamais une bascule pour couper.
- Arrêt uniquement après acceptation/annulation confirmée par le serveur, pas au clic optimiste. Une erreur d’enregistrement conserve la sonnerie. Déconnexion/expiration de session arrête les lecteurs et efface les alertes locales.
- Alertes ponctuelles réservations et récompenses conservées ; pas de superposition avec le carillon de commandes.
- Le tableau doit rester ouvert, l’ordinateur éveillé et audible. Une page fermée, un navigateur suspendu ou un Mac en veille ne peuvent pas garantir une alerte. Garder un seul onglet restaurant pour éviter un doublon.

## Contrôles

- Révision sans coupure : 17 tests ciblés réussis. Première liste non vide, répétition sans timers JS, signal PCM sans saturation, volume toujours non nul, suppression de pause/mute, test/réactivation sans interrompre la boucle, préférence muette historique ignorée, échec de sauvegarde et reprise après suspension du navigateur.
- Suite complète : 230 tests réussis. Syntaxe JavaScript et `git diff --check` valides.
- Navigateur sur tableau local isolé : activation au clic de connexion, commande fictive #901 déjà présente signalée, aucun bouton mute/pause, test pendant l’alerte conservant la sonnerie, acceptation fictive faisant disparaître le bandeau. Aucune erreur console ni commande réelle modifiée. Onglet et serveur de test fermés ensuite.
- Affichage mobile contrôlé ; aucun statut de commande réelle modifié. La capacité à entendre physiquement les haut-parleurs doit être confirmée par l’équipe avec « Tester le son ».
- Déploiement précédent confirmé : commit `8a89d77`, fichiers `order-alarm-2`. Révision sans coupure `order-alarm-3` vérifiée localement ; publication et vérification distante en cours. L’onglet restaurant existant était déconnecté : reconnexion déjà demandée au propriétaire pour le test physique du son, sans lire ni utiliser de mot de passe. Ne pas prétendre que le volume système a été vérifié ni que les haut-parleurs ont été entendus.
