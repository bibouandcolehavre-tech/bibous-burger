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

## Point de revue à résoudre

Google précise que ses examinateurs doivent pouvoir accéder à toutes les sections, ne créeront pas de compte et n'utiliseront pas de compte personnel pour acheter. La connexion actuelle nécessite un SMS ; il n'existe pas d'accès dédié aux examinateurs dans le code.

**Accord explicite reçu** : « Oui, prépare cet accès de test pour Google ». Accès implémenté et testé localement ; documentation dans `STORE_REVIEW_ACCESS.md`. Suite complète 222/222 et export web réussis. Accès limité aux données fictives, pas de SMS ni paiements, jetons de test refusés sur les routes réelles. Code privé hors dépôt ; aucun mot de passe de client utilisé. Il reste à déployer et à renseigner les instructions dans Play Console, puis à inclure l'interface dans un nouvel AAB.

Classification IARC : le questionnaire entraîne acceptation de ses conditions. Confirmation demandée au propriétaire avant de le remplir ; ne pas accepter sans réponse.

## Restant

- Contrôler le statut final du compte et des coordonnées publiques.
- Fiche Play (textes, catégorie, coordonnées, icône, visuel et captures réelles).
- Classification, public cible et formulaire Sécurité des données selon le code et les partenaires réellement utilisés.
- Accès de revue opérationnel, AAB téléchargé et vérifié, signature et dépôt Google Play.
- Contrôles de release et éventuels consentements/contrats à présenter au propriétaire avant acceptation.
- Envoyer pour examen uniquement après résolution de tous les éléments obligatoires. Rien n'a encore été publié ni envoyé pour examen.
