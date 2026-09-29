# Nouveau tableau restaurant — 29 septembre 2026

## Portée

Intégration de la maquette validée dans le tableau restaurant réel : accueil, navigation regroupée, commandes en liste/détail, planning guidé et grande alerte sonore/visuelle. Aucun changement des horaires, capacités, tarifs, fournisseurs ou données de production. Aucun changement de l’application client ou de la version Android en examen.

Les anciennes fonctions restent accessibles : Clients & fidélité → fiches et récompenses ; Marketing → actualités, CRM, notifications ; Réglages → paramètres et sauvegardes. Uber Direct et les modifications/remboursements des commandes restent dans le détail de commande.

## Protections

- Les créneaux proviennent du serveur. Brouillon local, récapitulatif puis confirmation ; avertissement obligatoire si une fermeture concerne des demandes existantes. Contrôle de révision conservé.
- Sonnerie originale répétée toutes les 4,3 secondes pour une commande payée à accepter, sans bouton de pause/muet. Arrêt après confirmation serveur uniquement ; une ouverture de fiche ne l’arrête pas.
- Activation audio par geste utilisateur, volume non nul, avertissement si le navigateur bloque le son. Le Mac doit rester éveillé, le tableau ouvert et le son système autorisé. Aucune garantie d’audibilité si le système ou l’onglet est coupé.
- Les changements de statut ne sont plus affichés avant confirmation du serveur ; double clic bloqué, délai réseau borné, réponse d’une ancienne session ignorée.
- Retrait prêt : « Remettre au client » termine directement le retrait (pas de fausse étape en livraison).
- Le premier clic n’est plus absorbé par la disparition de l’avertissement audio.

## Vérifications avant envoi

- Suite complète serveur : 307 tests réussis, zéro échec (29/09/2026).
- Tests ajoutés : navigation complète, sélection et échappement de commande, double clic/expiration, planning/brouillon/confirmation/conflits.
- Navigateur : accueil, commande, acceptation fictive/arrêt alarme, carte, clients, réservations, CRM, notifications, paramètres et sauvegardes ; planning avec fermeture fictive, avertissement de réservation existante et confirmation.
- Affichage vérifié à 320, 390, 820 pixels et bureau, sans débordement horizontal des vues contrôlées ; aucun message console d’erreur observé.
- Prévisualisation isolée : `node scripts/preview-dashboard.cjs`, port local 4189, mot de passe de test `local-qa-only`. Données fictives dans un répertoire temporaire, sans lecture du fichier de production ni des clés fournisseurs. Les données de test ne sont jamais publiées.

## Publication

À compléter après contrôle du déploiement public. Déployer uniquement depuis le worktree `burger-order-sms`, base `f28d4b2`. Ne pas pousser les commits iOS et modifications préexistantes du dossier `burger-club-app`.
