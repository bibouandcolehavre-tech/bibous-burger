# Quatrième burger offert / bienvenue — 9 octobre 2026

Demande : garder la bienvenue de 10 %, mais permettre au client de choisir soit cette remise, soit l’offre « 3 burgers seuls achetés, le quatrième offert », sans cumul entre les deux.

- Réglage par promotion `combineWelcome: false`, validé strictement côté serveur. Les anciennes offres sans ce réglage gardent leur comportement, notamment STB10.
- La validation du code renvoie `previewBaseRate: 0` aux clients web et Android existants ; aucun nouveau binaire Android ni dépôt iOS n’est nécessaire pour ce réglage.
- Le client choisit la promotion en appliquant son code, ou la bienvenue en retirant le code. Le message client explique ce choix.
- Le serveur recalcule indépendamment le montant et ignore toute remise client forgée. Les modifications de commande ne réintroduisent pas la bienvenue.
- Une commande payée utilisant cette promotion ne consomme pas la bienvenue. Les avantages Bibou + restent inchangés.
- L’offre porte sur les burgers seuls : un burger au prix de base le plus bas offert par groupe de quatre, hors menus et suppléments payants. Les frais de livraison restent inchangés.
- Campagne prévue pour le vendredi 9 octobre 2026, fin exclusive au 10 octobre 00 h 00, heure de Paris (`2026-10-09T22:00:00.000Z`). Code : `QUATREBURGER`.

Vérifications locales : 470 tests isolés réussis. Cas HTTP de paiement fictif à 29,70 € pour quatre Classique à 9,90 €, taux de bienvenue nul, flags client falsifiés ignorés, remise de bienvenue conservée après paiement, autre commande sans code à 35,64 €. Régression sur une offre cumulable existante et sur les aperçus web/Android.

La confirmation d’activation a été déplacée dans la page du back-office après un blocage reproductible de la fenêtre native du navigateur. Elle exige toujours un second appui explicite et invalide la confirmation lorsque les réglages changent. Tests d’activation, annulation, modification et changement de modèle réussis.

Aucune vraie commande, aucun débit, aucun SMS ou push de test. Les travaux préexistants de la borne et le dossier Apple build 16 sont hors intervention. Le visuel et le texte Instagram sont préparés séparément, sans publication sociale.

## Annonce d’accueil autorisée le 9 octobre

La carte temporaire « Le 4e offert ! » est publiée dans « Nos actualités » via le serveur, avec le code QUATREBURGER, l’échéance de 23 h 59 et les conditions. Elle est retirée à `2026-10-09T22:00:00.000Z`, ou avant si l’offre est désactivée, épuisée ou ne correspond plus aux conditions annoncées. Une fermeture exceptionnelle prime sur la publicité.

Les clients déjà installés sélectionnent une actualité par son identifiant initial : `epicu` sur Android, `contest` sur le web. La carte occupe temporairement le premier emplacement Android et les anciennes cartes sont conservées sous des identifiants éditoriaux temporaires ; le web se repositionne sur la première carte. Tous les identifiants et contenus habituels reviennent à expiration. Aucun changement persistant des actualités ou du concours, aucune reconstruction Android/iOS, aucune diffusion push/SMS.

## Extension au samedi autorisée le 9 octobre

La dernière précision du propriétaire retient samedi 10 octobre de 19 h à 22 h, heure de Paris. La soirée du vendredi est conservée jusqu’à minuit. Le code a donc deux plages (`activeWindows`) : vendredi du 9 octobre à 00 h au 10 octobre à 00 h, puis samedi de 19 h à 22 h. Fin globale exclusive : `2026-10-10T20:00:00.000Z`. Aucun code valable dans l’intervalle samedi 00 h–19 h, ni dimanche.

Les plages sont validées côté serveur (ISO strict, huit maximum, pas de chevauchement, dans les bornes globales), puis contrôlées aussi bien à la validation du code qu’à la création de commande. Les codes sans plages gardent leur comportement. Le back-office permet leur modification et exige toujours une confirmation avant activation ; les clients natifs existants n’ont pas à être reconstruits. La carte d’accueil annonce le samedi dès vendredi soir, puis ses horaires de 19–22 h samedi ; elle n’apparaît pas hors des plages actives.
