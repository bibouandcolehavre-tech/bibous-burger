# Retour compatible Android 1.0.0 (4) — 27 septembre 2026

## Autorisation et périmètre

Le propriétaire a explicitement choisi un retour temporaire ciblé pour préserver la version Android envoyée à Google le 24. Aucun nouvel envoi, aucune annulation d'examen et aucune nouvelle compilation native dans cette intervention.

- Livraison : retour aux plages de 30 minutes. Retrait et tables : heures fixes tous les 15 minutes. Deux livraisons / deux réservations par demi-heure, quatre personnes maximum par table ; retrait inchangé.
- Délais variables de préparation 20/30/45 minutes désactivés temporairement, comme avant le 27.
- Sélecteur halal/non halal retiré temporairement de l'interface. Les requêtes sans ce champ sont acceptées sans inventer de préférence. Les choix explicites déjà envoyés/enregistrés restent conservés et leurs incompatibilités avec le porc restent rejetées.
- Conservation du calcul des prix serveur, paiement vérifié, idempotence, CHORUS, sécurité, identité client, fidélité, isolement revue Google, alertes restaurant et intégration Keyyo.
- Aucune modification de commandes, réservations, comptes ou configurations réels. Les réservations à :20/:40 existantes ne sont ni déplacées ni effacées : leur durée de 20 minutes continue de consommer les places chevauchées. Les paiements déjà commencés restent possibles. Les fermetures enregistrées sont projetées en lecture seule de manière conservatrice.

## Sauvegarde des nouveautés

Branche locale `backup/pre-android4-rollback-20260927` sur `3a84a79` ; changements fonctionnels complets `de5a09a` puis `d5f37de`, déjà dans l'historique distant. Aucun effacement de cet historique. Ne pas réactiver ces nouveautés sans une mise à jour Android compatible et des tests croisés.

## Contrôles avant diffusion

- Suite complète : **283 tests réussis**, zéro échec. Aucun vrai paiement/SMS.

- Export web réussi, interface revenue exactement à celle du commit `49ef33a` (les corrections postérieures au build Android mais antérieures aux nouvelles options sont conservées).
- Rejeu des requêtes extraites du source Android réel `3239d38` : livraison, retrait viande sans champ nouveau, végétarien, table à :15, paiement simulé, historique et arrivée en cuisine locale après paiement seulement.
- AAB du dossier Google inchangé, empreinte SHA-256 vérifiée. Pas de nouvel essai d'interface native sur téléphone ; contrôle du contrat exact des requêtes.
- Tests fictifs supplémentaires : capacité pendant le retour de grille, fermetures, choix viande non inventé, anciens choix explicites et paiement des anciennes commandes de vingt minutes.
- Scripts/résultats détaillés dans `../compatibility-android-20260927/check-restored.cjs` et `results-restored.json` (aucun secret/jeton dans le résultat).

## Diffusion

En préparation, non encore vérifiée en production à la rédaction de cette section. Compléter après contrôle public API/web et revue isolée. Ne pas annoncer Google approuvé : le statut Google n'a pas été réexaminé ici.

Fichiers préexistants laissés intacts et hors commit : `KEYYO_CALL_SMS.md`, `RELEASE_READINESS.md`, `UBER_DIRECT.md`, `server/data.json`. Aucun second SMS demandé/envoyé.
