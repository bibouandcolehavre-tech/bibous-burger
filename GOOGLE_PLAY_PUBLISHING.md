# Google Play — reprise du 24 septembre 2026

Le propriétaire demande de reprendre la publication Android et souhaite un envoi aujourd'hui. La soumission est autorisée ; la date de mise en ligne reste soumise à l'examen de Google. Aucun achat supplémentaire autorisé.

## Dossier existant

- Organisation Bibou & Co : `8477636530916827216`.
- Application en **brouillon** : `4975001923758008093`, package `com.krokly.bibousburgers`. Ne pas recréer de fiche.
- Tableau de bord : https://play.google.com/console/u/0/developers/8477636530916827216/app/4975001923758008093/app-dashboard
- L'accueil ne montre plus la bannière de validation d'identité des premières étapes. Coordonnées contrôlées dans le compte : site bibousburgers.com, e-mails et téléphones public/privé validés. E-mail public `bibouandcolehavre@gmail.com`, fixe public `+33278088498` repris sur la fiche. Ne pas modifier les coordonnées privées.

## Préparation effectuée

- 217/217 tests réussis avec serveurs de tests locaux autorisés. Les premiers échecs en environnement restreint étaient des interdictions d'écoute réseau (`EPERM`), pas des régressions applicatives.
- Politique publique ouverte et vérifiée ; URL enregistrée dans Play : `https://bibous-burger-app.onrender.com/?legal=privacy`.
- Déclarations enregistrées : pas d'annonces, pas d'identifiant publicitaire, application non gouvernementale, aucune fonctionnalité de santé.
- Déclaration financière : **Récompenses, points, programmes de fidélité et autres avantages**, seule option sélectionnée. Google n'exige pas de document complémentaire pour ce choix. Enregistrement effectué ; vérifier dans la synthèse des déclarations.
- Expo Free confirmé : 15 compilations Android incluses, 4 utilisées avant lancement, estimation de facture 0 $.
- Première compilation Google Play lancée : profil `production`, version 1.0.0 / code 2, signature distante existante, aucun auto-submit.
- Build : https://expo.dev/accounts/bibou-and-co/projects/bibous-burger/builds/5f5fad84-6d54-4c9c-b95b-a67be6275002
- Cette première compilation a été **annulée alors qu'elle était encore en file d'attente** pour la remplacer par celle incluant l'accès de revue approuvé. Ne pas déposer cette version sans accès Google.
- Source téléversée, pas de nouvelle clé ; données serveur, `.env` et secrets exclus par `.easignore`.
- Catégorie enregistrée : Alimentation et boissons. Coordonnées de support enregistrées avec URL HTTPS de l'application.

## Accès de revue et classification

Google précise que ses examinateurs doivent pouvoir accéder à toutes les sections, ne créeront pas de compte et n'utiliseront pas de compte personnel pour acheter. La connexion client ordinaire nécessite un SMS.

**Accord explicite reçu** : « Oui, prépare cet accès de test pour Google ». Accès implémenté, déployé et testé ; documentation dans `STORE_REVIEW_ACCESS.md`. Suite complète 222/222 et exports web/Android réussis. Accès limité aux données fictives, pas de SMS ni paiements, jetons de test refusés sur les routes réelles. Code privé hors dépôt ; aucun mot de passe de client utilisé.

- Commit `746332a` poussé ; API publique et client web vérifiés sur cette version. Test API public : connexion isolée 200, compte fictif 200, accès au compte réel refusé 401, session de test supprimée 200.
- Instructions en anglais et code fournis dans **Informations de connexion**, enregistrés. Accès limité = Oui. Utilisation optionnelle des identifiants sur appareils de partenaires désactivée.
- Nouvelle compilation : https://expo.dev/accounts/bibou-and-co/projects/bibous-burger/builds/1c8c91d0-279f-4f13-af62-b20a9ddbdeb6 — production 1.0.0 / versionCode 3, commit `746332a`. Encore en file d'attente au dernier contrôle, aucun achat ni nouvelle signature.

Classification IARC : accord explicite « Oui, accepte les conditions IARC » reçu. Questionnaire rempli et enregistré le 24 septembre : **PEGI 3** Europe, Everyone ESRB. Ce n'est pas la soumission de l'application.

Public cible confirmé par le propriétaire : **adolescents dès 13 ans et adultes**. Formulaire enregistré : 13–15, 16–17, 18+.

Sécurité des données : déclaration finale enregistrée, confirmation visible dans Play. Analyse détaillée dans `PLAY_DATA_SAFETY.md`. Tableau de bord : 10 tâches de configuration terminées sur 11 ; seule la fiche Play reste à compléter.

## Logo approuvé et préparation de la fiche

- Le propriétaire a revu puis autorisé le logo bleu le 24 septembre : « Tu peux mettre ce logo-là temporairement ».
- Original retrouvé et conservé dans `assets/bibous-blue-original.png` (image `exec-87a57e16-981e-4d76-99f7-fc93bb6e571a.png`). Pas de régénération.
- Formats natifs 1024 px et icône Play 512 px produits ; marge Android adaptative vérifiée avec masque circulaire, tout le nom reste lisible. Recette : `scripts/prepare-store-assets.cjs` avec sharp.
- La compilation code 3 a été annulée **encore en file d'attente**, car elle utilisait l'ancienne icône orange. Une nouvelle compilation est nécessaire avec le logo approuvé.
- Compilation avec logo approuvé lancée : **1.0.0 / code 4**, commit `3239d38`, signature distante inchangée, https://expo.dev/accounts/bibou-and-co/projects/bibous-burger/builds/487dadf6-d8a6-48c1-acec-0054ee352b3c. Source téléversée ; encore en file d'attente au dernier contrôle. Aucun supplément payant souscrit.
- Visuel Play 1024 × 500 dans `store-assets/google-play/feature-1024x500.png`, composé du logo approuvé et de texte décrivant les fonctions réelles.
- Fiche française entièrement enregistrée : titre Bibou's Burgers, descriptions, logo, bannière, deux captures natives (accueil puis connexion). Statut confirmé : **Prête à être envoyée pour examen**. Icône et bannière signalées comme visuels générés/modifiés avec IA, conformément à la déclaration demandée ; captures non retouchées.

## Restant

- France sélectionnée et sauvegardée comme seul pays de diffusion initial. La zone de livraison reste limitée à 5 km, inchangée.
- Brouillon de production enregistré : « 1.0.0 (4) — Première version », notes françaises renseignées. La signature Google Play et la protection automatique étaient déjà activées, aucun changement effectué à ces réglages.
- 222/222 tests relancés et réussis après intégration du logo ; export web réussi. Pas de changement de logique métier ni de données client.
- **À faire :** attendre la compilation code 4, télécharger et vérifier l'AAB (package, version, signature), puis l'importer dans le brouillon de production existant.
- Contrôles de release et éventuels consentements/contrats à présenter au propriétaire avant acceptation.
- Envoyer pour examen uniquement après résolution de tous les éléments obligatoires. Rien n'a encore été publié ni envoyé pour examen.
