# Google Play — reprise du 24 septembre 2026

Le propriétaire demande de reprendre la publication Android et souhaite un envoi aujourd'hui. La soumission est autorisée ; la date de mise en ligne reste soumise à l'examen de Google. Aucun achat supplémentaire autorisé.

## État actuel — envoi confirmé le 24 septembre à 18 h 34 (Paris)

**La version Android 1.0.0 (4) a été envoyée à Google Play.** La console affiche désormais **« Modifications en cours d'examen »** pour la release de production et les neuf autres éléments du dossier. Elle n'est **pas encore publiée**.

- Page de suivi : https://play.google.com/console/u/0/developers/8477636530916827216/app/4975001923758008093/publishing
- Les vérifications rapides automatiques étaient encore en cours juste après l'envoi (12 %, maximum annoncé de 13 minutes). Google précise que le transfert aux examinateurs suit leur fin ; aucune validation finale ni acceptation n'est encore confirmée.
- Confirmation d'envoi effectuée dans la boîte « Envoyer 10 modifications pour examen ? ». Google indiquait un examen habituellement sous sept jours, pouvant prendre plus longtemps ; ce n'est pas une date garantie.
- Publication gérée déjà désactivée, réglage non modifié. La console indique une publication après approbation, pour la France, sans autre envoi manuel prévu si le dossier est accepté.
- Aucun nouveau contrat, achat, changement de clé ou de logo. Aucun compte ni commande de client réel touché.
- Suivi `finaliser-l-envoi-android-de-bibou-s-burgers` **désactivé (PAUSED), confirmé par l'outil** après cette soumission. Ne pas relancer un build ni renvoyer la même release.
- La suite consiste à répondre à une éventuelle demande de Google ou à constater sa validation. Le dossier Apple est indépendant (relance de l'inscription envoyée ce jour, note locale `../APPLE_ENROLLMENT_FOLLOWUP.md`).

Les sections ci-dessous conservent l'historique de préparation ; leurs mentions « encore en file » ou « rien envoyé » décrivent les étapes antérieures, pas cet état actuel.

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

## Restant avant la compilation — historique

- France sélectionnée et sauvegardée comme seul pays de diffusion initial. La zone de livraison reste limitée à 5 km, inchangée.
- Brouillon de production enregistré : « 1.0.0 (4) — Première version », notes françaises renseignées. La signature Google Play et la protection automatique étaient déjà activées, aucun changement effectué à ces réglages.
- 222/222 tests relancés et réussis après intégration du logo ; export web réussi. Pas de changement de logique métier ni de données client.
- **À faire :** attendre la compilation code 4, télécharger et vérifier l'AAB (package, version, signature), puis l'importer dans le brouillon de production existant.
- Contrôles de release et éventuels consentements/contrats à présenter au propriétaire avant acceptation.
- Envoyer pour examen uniquement après résolution de tous les éléments obligatoires. Rien n'a encore été publié ni envoyé pour examen.

## Reprise automatique autorisée

- Le 24 septembre vers 17 h 11 (Paris), accord explicite du propriétaire : « Oui, active le suivi et envoie à Google », pour un contrôle toutes les 10 minutes pendant 3 heures maximum et l'envoi de la version 1.0.0 (4) après vérifications, sans nouvelle dépense.
- Suivi de cette conversation créé et confirmé actif : `finaliser-l-envoi-android-de-bibou-s-burgers`. Échéance : 24 septembre 2026 à 20 h 11 (Paris). L'arrêter dès que l'envoi est confirmé ou si une intervention personnelle est indispensable.
- Ne pas confondre ce suivi avec une soumission déjà faite. Reprendre le build et le brouillon existants ; ne pas dupliquer les compilations ou les releases.
- Les pages Expo et Play sont conservées pour la reprise. Le Mac et Codex doivent rester ouverts pour l'exécution locale.
- Contrôle automatique du 24 septembre à 17 h 22 (Paris) : build code 4 toujours **Queued / Free Tier Queue**, temps écoulé 30 min 57 s et estimation Expo d'environ 19 min avant démarrage. Aucun artefact disponible, aucune compilation relancée, aucun envoi Google effectué. Prochaine vérification au passage programmé suivant.
- Contrôle automatique du 24 septembre à 17 h 32 (Paris), via EAS en lecture seule : statut **IN_QUEUE**, aucun artefact. Identifiant, profil production, code 4 et commit `3239d38` inchangés. Aucun envoi Google ; suivi maintenu sans relancer de compilation.
- Contrôle automatique du 24 septembre à 17 h 43 (Paris) : EAS confirme encore **IN_QUEUE**, aucun artefact ni journal de compilation. Même build de production 1.0.0 (4). Aucun envoi Google et aucune relance ; prochain contrôle programmé conservé.

## Compilation réussie et importation en cours — 24 septembre

- Contrôle unique de 17 h 54 : build `487dadf6-d8a6-48c1-acec-0054ee352b3c` **FINISHED**, terminé à 17 h 54 min 04 s (Paris), profil production, version 1.0.0 (4), commit `3239d38915d0515c91785d950c7d6bd395666cb0`.
- AAB téléchargé : `/private/tmp/bibous-burgers-production-v4-487dadf6.aab` (67,5 Mo). SHA-256 : `02a0799b309147afa8db473032b8d8bbd49d0a0dbe2232fb378f1b02cc4b7a4a`.
- Validation structurelle réussie avec l'outil officiel Google bundletool 1.18.3. Manifeste contrôlé : package `com.krokly.bibousburgers`, versionName `1.0.0`, versionCode `4`, target SDK 36, min SDK 24.
- Certificat lu et signature traitée sans erreur par keytool : RSA 2048 / SHA256withRSA ; empreinte SHA-256 `C7:46:4C:D0:D9:24:06:98:2A:DF:A4:75:41:67:B6:A3:7B:FE:B2:32:16:DF:1A:B4:82:C6:03:EF:66:EC:77:C1`.
- Importation démarrée dans **le brouillon existant release 1** : https://play.google.com/console/u/0/developers/8477636530916827216/app/4975001923758008093/tracks/4697410309862779058/releases/1/prepare
- À 18 h 31 (Paris), transfert encore en cours : **66 %, 44,6 Mo / 67,5 Mo**. Le dialogue de transfert a pris environ 33 minutes ; aucune seconde importation n'a été lancée. **Ne pas quitter/recharger cet onglet pendant le transfert**, sinon Google l'annule.
- Onglet IAB actuel : `32`, handle `playPublishTab` ; handle Playwright `playPublishPW` si encore vivant. Ne pas annoncer l'envoi pour examen : seuls le transfert et l'analyse du fichier sont en cours.
- Transfert et analyse terminés à 18 h 33 environ : Google affiche bien l'App Bundle **4 (1.0.0)**, SDK cible 36, symboles natifs joints. Les contrôles de version ne montrent **aucune erreur** et un seul avertissement non bloquant : absence de fichier de désobscurcissement R8/ProGuard (aide au diagnostic des crashs, pas une incompatibilité ni un refus de signature).
- Release enregistrée, confirmation Google reçue ; navigation vers la vue d'ensemble de publication pour l'envoi final. **Ne pas confondre l'enregistrement avec une soumission.**
- Copie durable du fichier livrable conservée hors dépôt applicatif : `../release-artifacts/bibous-burgers-production-v4-487dadf6.aab`.
- Le fonctionnement de `keytool -printcert -jarfile` a été vérifié dans la source officielle OpenJDK : il lit toutes les entrées avec `JarFile(..., true)` et échoue si la signature ou un condensat est invalide. Le contrôle local a réussi ; Google a ensuite accepté l'importation.
