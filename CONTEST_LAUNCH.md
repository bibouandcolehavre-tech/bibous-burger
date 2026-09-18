# Actualités et concours — préparation, pas lancement

## Ce qui fonctionne

- L’accueil affiche « Nos actualités ». Quatre cartes par défaut : vidéo Epicu du 2 mai 2026, réseaux sociaux, préparation du concours et article Paris-Normandie. Aucun burger dans le carrousel ; la carte des produits est inchangée.
- Dans **Actualités & concours** de l’espace restaurant : modifier textes/liens/photos par URL HTTPS, réordonner, masquer, retirer et ajouter des cartes (maximum huit). Enregistrer publie uniquement ces cartes, pas le concours. Les changements sont lus à l’ouverture de l’accueil et toutes les 60 secondes pendant son affichage.
- Les changements concurrents sont refusés plutôt qu’écrasés. Une actualisation conserve les champs non enregistrés.
- Brouillon privé du concours : titre, dates de Paris, zone, lots, règlement, aperçu, checklist, compteurs et classement. Aucun endpoint ni bouton d’activation.
- Mécanique testée sur base isolée : inscription explicite après vérification SMS, lien/code personnel, attribution unique d’un nouveau participant à son parrain, compteur personnel, classement privé et ex æquo signalés. Ce ne sont pas des installations mesurées par les stores.
- Ancien client : peut participer/parrainer, mais son inscription ne compte pas comme un nouveau client. Une nouvelle inscription doit être créée **et** vérifiée pendant les dates du concours, puis rejoindre le concours. Un clic ou un partage seul ne compte jamais.
- Numéro vérifié uniquement après validation Twilio serveur. Modifier le téléphone dans un profil ne permet pas de le déclarer vérifié. Une nouvelle vérification est nécessaire pour les sessions anciennes sans cette preuve.
- Aucun point fidélité accordé pour le concours. Le parrainage habituel reste séparé, après première commande payée.
- Suppression de compte : retrait/anonymisation de la participation ; empreinte du numéro chiffrée par HMAC et limitée à cette campagne pour empêcher une réinscription identique. Registre purgé après 90 jours suivant la clôture lors de l’entretien horaire ou d’un accès au service ; copies historiques soumises à la rotation des sauvegardes (jusqu’à sept jours supplémentaires). Le secret de session serveur doit rester stable.

## Avant un lancement réel — décisions encore nécessaires

1. Confirmer dates, valeur et nature exacte des deux lots. Les propositions de menus ne sont pas des engagements validés.
2. Finaliser le règlement : organisateur Bibou & Co, contacts, majorité, zone exacte, gratuité/sans achat, période, définition d’un filleul valide, auto-parrainage, comptes multiples, contrôles, contestations, ex æquo, tirage, notification/remise des lots, délais, données personnelles et retrait.
3. Vérifier les règles Meta/Instagram actuelles, mentions d’absence de parrainage par Instagram et publication. Aucun avis récompensé, consentement publicitaire obligatoire ou collecte du carnet d’adresses.
4. Finaliser l’information de confidentialité et le contrôle des participants (les déclarations d’âge/résidence ne sont pas des preuves documentaires).
5. Développer une activation explicite et auditée, la clôture, la sélection/désignation et l’historique des résultats **après validation** de ces règles. Aucun gagnant ni tirage effectué à ce stade.
6. Lorsque les applications seront disponibles : vérifier les liens stores et le parcours d’invitation après installation. Le lien actuel ouvre l’application web ; aucune attribution automatique à travers l’installation d’une application native n’est promise. Garder le code comme solution de secours.

La carte publique actuelle annonce seulement une préparation, sans lot, date ni formulaire de participation actif. Aucune publication Instagram, publicité, facturation ou notification client lancée.

## Vidéo de démonstration

Sources et rendu conservés localement dans `../video-demo/` : captures de la vraie interface sur une base fictive, script français, voix macOS de synthèse Thomas et montage vertical. Aucun paiement effectué, aucun numéro réel, aucun contenu client. Premier montage de validation, pas enregistrement d’un comédien ni capture vidéo continue des gestes.

## Vérification locale

`npm test`, `npm run build:web`, puis `NODE_ENV=test node server/test-fixtures/preview-marketing.cjs`.
Le script crée sa propre base temporaire. La page `/fixtures` permet de tester brouillon/concours fictif actif et deux comptes fictifs. Restaurant : `demo-only`. Ne jamais employer ce mot de passe ni ces comptes en production.

Repères consultés pour préparer le lancement, à revérifier lors de la finalisation :

- DGCCRF : https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/loterie-des-pratiques-commerciales-reglementees
- CNIL : https://www.cnil.fr/sites/default/files/atoms/files/commerce-donnees_perso_parrainage_jeux_concours.pdf
- Google Play : https://support.google.com/googleplay/android-developer/answer/9898684?hl=fr

La page officielle des promotions Instagram demandait une connexion : ne pas présenter la conformité Meta comme déjà validée.
