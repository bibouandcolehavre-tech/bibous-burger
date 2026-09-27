# Horaires et choix de viande — 27 septembre 2026

## Demandes validées par le propriétaire

- Retrait, livraison et tables : heures fixes toutes les 20 minutes (:00, :20, :40).
- Minimum de préparation pour livraison/retrait : moins de 25 € = 20 min ; de 25 à 60 € inclus = 30 min ; plus de 60 € = 45 min. Calcul sur les produits avant remise, hors livraison. Tables non concernées par ce délai.
- Capacité : deux livraisons / deux tables par plage de 20 minutes ; retrait inchangé. Maximum quatre personnes par table, horaires d’ouverture et bonus fidélité retrait anticipé inchangés.
- Choix halal/non halal entre protéine et crudités. Préférence avant la carte ; avertissements visibles lorsque halal est choisi, sans pastilles supplémentaires dans le mode normal.
- Pas de version halal du Taurus, Hambagu, Gros Lard, À travers les montagnes et Pork. Le propriétaire a confirmé le jambon de Parme du Taurus. Recettes, descriptions et photos non modifiées.

## Implémentation

- Règles communes dans `service-policy.js` et `dietary-policy.js`, copiées dans l’image Docker.
- Le serveur recalcule les prix et le délai à la création, puis sous verrou avant enregistrement. Réductions, CHORUS et valeurs de délai envoyées par le client ne contournent pas la règle.
- Historique non migré/déplacé : anciennes plages de livraison et anciennes tables continuent à consommer les nouvelles disponibilités chevauchées. Exceptions d’ouverture/fermeture anciennes projetées conservativement, sans écrire les données. Nouveau format marqué `slotMinutes:20` lors d’une modification explicite des horaires.
- Choix de viande requis pour les nouveaux burgers avec viande. Halal + recette/supplément porc rejeté côté serveur. Version galette sans choix viande. Aucun profil religieux enregistré ; préférence de carte en mémoire seulement.
- Mention viande gardée au panier et en gras dans la composition du ticket restaurant. Les suggestions cheddar-bacon sont écartées si le panier contient un burger halal.
- Les commandes déjà enregistrées restent consultables/payables selon leurs conditions existantes et les fermetures actuelles. Aucun compte/commande réel créé ou modifié pendant les tests.

## Vérification et diffusion

- Suite complète : 281 tests réussis ; export web réussi. Contrôles HTTP isolés : prix falsifiés et code CHORUS ne réduisent pas le délai ; choix halal conservé dans la commande.
- Contrôle visuel Chrome en largeur 390 px : avertissement porc, ordre protéine → viande → crudités, choix conservé dans le panier.
- Mise en ligne web/API/tableau restaurant confirmée le 27 septembre : commit `de5a09a`, API health sur cette version, bundle web public identique à l’export local (`AppEntry-fdbd2de732a5686e2a1c863d0414a358.js`), ticket restaurant avec groupe « Choix de viande ». Disponibilités publiques contrôlées pour les trois services et délais 20/45 min aux extrêmes. Mode halal contrôlé dans l’interface publique ; aucun achat ni réservation réelle créé.
- Aucune nouvelle compilation native ni soumission Google/Apple lancée dans cette tâche.
- IMPORTANT : une ancienne version installée ne possède pas le nouveau choix requis. Préparer une nouvelle compilation avant de distribuer la version native ; la version Android code 4 conservée dans le dossier Google est antérieure à ces changements. Ne pas annoncer que ce binaire est à jour.
- Fichiers préexistants `server/data.json`, `RELEASE_READINESS.md`, `KEYYO_CALL_SMS.md` et `UBER_DIRECT.md` laissés hors du commit de cette fonctionnalité.

## Notification au propriétaire

- À sa demande explicite, un SMS ponctuel a été envoyé via Keyyo le 27 septembre au mobile du propriétaire finissant par 94 16, après vérification de la mise en ligne. Réponse du fournisseur confirmée : `SMS_ACCEPTED_BY_KEYYO`. Cela confirme l’acceptation de l’envoi, pas la réception sur le téléphone.
- Le message annonce uniquement la mise à jour **web**, avec créneaux de 20 min, préparation 20/30/45 min et choix halal, et le lien de l’application web.
- Garde anti-doublon conservée sur le disque serveur : `/var/data/update-notification-de5a09a-owner.json`, statut `accepted`. **Ne pas renvoyer ce SMS.** Aucun secret copié dans le dépôt ; aucun SMS à un client réel. Ce message ponctuel ne valide pas les notifications automatiques après appels Keyyo, toujours en attente de diagnostic fournisseur.
