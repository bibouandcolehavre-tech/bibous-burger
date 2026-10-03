# Actualités et concours — préparation, pas lancement

## Ce qui fonctionne

- L’accueil affiche « Nos actualités ». Ordre demandé : préparation du concours, vidéo Epicu du 2 mai 2026, vidéo Paris-Normandie du 13 juin 2025 (page Facebook vérifiée Paris Normandie Le Havre, vidéo 1226219005580139), puis réseaux sociaux. Cette vidéo remplace l’article Étoiles gourmandes. Aucun burger dans le carrousel ; la carte des produits est inchangée.
- Dans **Actualités & concours** de l’espace restaurant : modifier textes/liens/photos par URL HTTPS, réordonner, masquer, retirer et ajouter des cartes (maximum huit). Enregistrer publie uniquement ces cartes, pas le concours. Les changements sont lus à l’ouverture de l’accueil et toutes les 60 secondes pendant son affichage.
- Les changements concurrents sont refusés plutôt qu’écrasés. Une actualisation conserve les champs non enregistrés.
- Brouillon privé du concours : titre, dates de Paris, zone, trois lots, règlement, aperçu, checklist, compteurs et classement. La page du restaurant ne comporte pas de bouton de lancement ; une route distincte, authentifiée et demandant une confirmation explicite peut publier le règlement complet une fois tous les champs prêts. Cette route n’a pas été utilisée en production.
- Le prototype suit maintenant la préférence exprimée par le propriétaire : **classement, sans tirage au sort**. Barème validé le 3 octobre 2026 : 20 points par nouvel inscrit vérifié et 1 point par euro cumulé de commandes effectivement payées, sans plafond. Les commandes annulées, impayées et les montants remboursés ne donnent pas de points ; les anciens comptes peuvent participer gratuitement et gagner des points en parrainant de nouveaux clients. Le classement est provisoire, sous pseudonymes. À points égaux, la personne qui a atteint son score la première passe devant ; une égalité au même instant reste signalée pour vérification manuelle. Aucun gagnant n’est désigné automatiquement.
- Lots validés par le propriétaire le 3 octobre 2026 : 1re place, deux menus par mois de novembre 2026 à octobre 2027 (24 menus) ; 2e place, un menu par mois de novembre 2026 à avril 2027 (6 menus) ; 3e place, deux menus en une fois en novembre 2026. Chaque mois est non reportable et non cumulable. Le menu est au choix parmi les menus individuels disponibles, en retrait, hors suppléments et livraison. Le propriétaire souhaite des codes personnels limités au mois et aux menus prévus ; cette mécanique de remise reste à développer et tester avant la première utilisation.
- Dates validées le 3 octobre 2026 : ouverture le lundi 5 octobre 2026 et clôture le samedi 31 octobre 2026 inclus, heure de Paris. Ces dates sont préremplies dans le brouillon privé ; elles n’activent pas le concours.
- Le propriétaire a ajouté le 3 octobre 1 point par jour pour l’appui sur « Partager mon lien », avec limite calculée selon l’heure de Paris. L’application ne sait pas prouver qu’un contenu a été publié sur Instagram ou Facebook ; le règlement doit le dire explicitement. Un lien sélectionnable permet le copier-coller sans exiger un réseau social.
- Mécanique testée sur base isolée : inscription explicite après vérification SMS, lien/code personnel, attribution unique d’un nouveau participant à son parrain, compteur personnel, classement privé et ex æquo signalés. Ce ne sont pas des installations mesurées par les stores.
- Ancien client : peut participer/parrainer, mais son inscription ne compte pas comme un nouveau client. Une nouvelle inscription doit être créée **et** vérifiée pendant les dates du concours, puis rejoindre le concours. Un clic ou un partage seul ne compte jamais.
- Numéro vérifié uniquement après validation Twilio serveur. Modifier le téléphone dans un profil ne permet pas de le déclarer vérifié. Une nouvelle vérification est nécessaire pour les sessions anciennes sans cette preuve.
- Aucun point fidélité accordé pour le concours. Le parrainage habituel reste séparé, après première commande payée.
- Suppression de compte : retrait/anonymisation de la participation ; empreinte du numéro chiffrée par HMAC et limitée à cette campagne pour empêcher une réinscription identique. Registre purgé après 90 jours suivant la clôture lors de l’entretien horaire ou d’un accès au service ; copies historiques soumises à la rotation des sauvegardes (jusqu’à sept jours supplémentaires). Le secret de session serveur doit rester stable.

## Avant un lancement réel — décisions encore nécessaires

1. Finaliser la date d’annonce des résultats et le délai de réponse des gagnants. Prévoir un suivi des menus déjà remis et des codes personnels mensuels, limités au compte gagnant, au bon mois et au nombre de menus, sans utiliser le code CHORUS illimité.
2. Finaliser le règlement : organisateur Bibou & Co, contacts, majorité, zone exacte, gratuité/sans achat, période validée, définition d’un filleul valide, paiements/annulations/remboursements, auto-parrainage, comptes multiples, contrôles, contestations, ex æquo, notification/remise des lots, délais, données personnelles et retrait.
3. Vérifier les règles Meta/Instagram actuelles, mentions d’absence de parrainage par Instagram et publication. Aucun avis récompensé, consentement publicitaire obligatoire ou collecte du carnet d’adresses.
4. Finaliser l’information de confidentialité et le contrôle des participants (les déclarations d’âge/résidence ne sont pas des preuves documentaires).
5. Utiliser l’activation explicite **après validation** du règlement ; la clôture par date est en place, mais la désignation vérifiée et l’historique de remise des menus restent à développer. Aucun gagnant désigné à ce stade. Les menus promis sur douze mois exigent un suivi des lots séparé du registre de participation purgé après 90 jours.
6. Lorsque les applications seront disponibles : vérifier les liens stores et le parcours d’invitation après installation. Le lien actuel ouvre l’application web ; aucune attribution automatique à travers l’installation d’une application native n’est promise. Garder le code comme solution de secours.
7. La version Android actuellement publiée contient encore l’ancienne présentation avec « meilleur parrain » et « tirage au sort ». Une porte de compatibilité `contestApi=2` isole désormais le nouveau concours : la nouvelle web app et le futur Android voient le classement ; l’ancien Android reçoit l’état inactif et garde la carte « se prépare ». Cette protection est testée. La web app peut donc être préparée pour le 5 octobre sans annoncer le concours comme actif dans l’ancien Android, mais il faut construire et soumettre la nouvelle version native à Google pour que ses utilisateurs en bénéficient.

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
- Google Play, règles des concours/programmes de fidélité : https://support.google.com/googleplay/android-developer/answer/18258653?hl=en

La page officielle des promotions Instagram demandait une connexion : ne pas présenter la conformité Meta comme déjà validée.
