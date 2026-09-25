# Ouvertures et fermetures par date

Espace restaurant : https://bibous-burgers-restaurant.onrender.com/ → Ouvertures et fermetures.

- Horaires hebdomadaires conservés, y compris dimanche 19 h–21 h.
- Date obligatoire dans les 14 prochains jours (même horizon que l’application client), heure de Paris.
- Cases à cocher par service : retrait et tables au quart d’heure, livraison par demi-heure.
- Tous les horaires de 00 h à 24 h peuvent être activés. Après minuit, sélectionner la date du lendemain.
- Raccourcis fermeture midi, soir ou journée pour les trois services.
- Les modifications n’affectent que la date choisie. Les commandes et réservations existantes ne sont pas annulées.
- Une fermeture touchant des demandes existantes exige une reconnaissance explicite de leur prise en charge.
- Revenir aux horaires habituels et annuler les changements sont disponibles.
- Conflits entre onglets détectés par révision ; annuler/actualiser permet de récupérer la version courante.

Les exceptions sont enregistrées dans `database.serviceSchedule` sur le disque persistant, incluses dans les sauvegardes normales. Un historique de 200 enregistrements sans coordonnées clients est conservé. API privée GET/PATCH `/api/dashboard/service-schedule` ; aucune écriture publique. Les créneaux supplémentaires sont présentés par les API publiques et lus par le client web. Le serveur contrôle les nouvelles commandes, réservations et ouvertures de paiement. Un paiement déjà ouvert chez le prestataire ou déjà réglé reste à traiter séparément.

Fermeture exceptionnelle demandée le 25 septembre 2026 au soir : tous les créneaux habituels à partir de 19 h sont fermés par défaut ce jour-là. L’administrateur peut explicitement les rouvrir. Le premier correctif (149f494) a été vérifié en production : 6 créneaux livraison, 12 retrait et 12 tables fermés.

Validation : 237 tests passent (dont authentification, persistance, horaires supplémentaires, séparation date/service, conflits, commandes et tables existantes, refus de paiement sur créneau supprimé). Export web réussi. Écran local testé avec base fictive : retrait samedi 22 h 45 activé et enregistré, sans écriture de test sur la production.
