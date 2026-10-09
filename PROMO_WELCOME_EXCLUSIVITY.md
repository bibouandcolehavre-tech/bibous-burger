# Quatrième burger offert / bienvenue — 9 octobre 2026

Demande : garder la bienvenue de 10 %, mais permettre au client de choisir soit cette remise, soit l’offre « 3 burgers seuls achetés, le quatrième offert », sans cumul entre les deux.

- Réglage par promotion `combineWelcome: false`, validé strictement côté serveur. Les anciennes offres sans ce réglage gardent leur comportement, notamment STB10.
- La validation du code renvoie `previewBaseRate: 0` aux clients web et Android existants ; aucun nouveau binaire Android ni dépôt iOS n’est nécessaire pour ce réglage.
- Le client choisit la promotion en appliquant son code, ou la bienvenue en retirant le code. Le message client explique ce choix.
- Le serveur recalcule indépendamment le montant et ignore toute remise client forgée. Les modifications de commande ne réintroduisent pas la bienvenue.
- Une commande payée utilisant cette promotion ne consomme pas la bienvenue. Les avantages Bibou + restent inchangés.
- L’offre porte sur les burgers seuls : un burger au prix de base le plus bas offert par groupe de quatre, hors menus et suppléments payants. Les frais de livraison restent inchangés.
- Campagne prévue pour le vendredi 9 octobre 2026, fin exclusive au 10 octobre 00 h 00, heure de Paris (`2026-10-09T22:00:00.000Z`). Code : `QUATREBURGER`.

Vérifications locales : 468 tests isolés réussis. Cas HTTP de paiement fictif à 29,70 € pour quatre Classique à 9,90 €, taux de bienvenue nul, flags client falsifiés ignorés, remise de bienvenue conservée après paiement, autre commande sans code à 35,64 €. Régression sur une offre cumulable existante et sur les aperçus web/Android.

Aucune vraie commande, aucun débit, aucun SMS ou push de test. Les travaux préexistants de la borne et le dossier Apple build 16 sont hors intervention. Le visuel et le texte Instagram sont préparés séparément, sans publication sociale.
