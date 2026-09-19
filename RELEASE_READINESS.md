# Préparation Android et iPhone — 19 septembre 2026

## État réel

L’application web et l’API sont déployables. Les exports de code iOS et Android réussissent, mais **aucun APK/AAB/IPA signé n’a encore été généré ni testé sur un appareil réel**. Ne pas présenter l’application comme prête à soumettre aux boutiques tant que les étapes ci-dessous ne sont pas terminées.

## Contrôles réalisés

- 124 tests automatisés : liens sociaux, paiements et doublons, annulation, fidélité/parrainage, créneaux, réservations, récompenses, stock, accès privés, sauvegardes, initialisation sans données clients embarquées, limitation des connexions et reprise après interruption.
- Export web et exports Hermes iOS/Android réussis.
- Expo Doctor : 21 contrôles sur 21 réussis.
- Audit des dépendances applicatives : aucune vulnérabilité connue après correctif ciblé UUID, sans mise à niveau majeure du framework.
- Reprise de paiement vérifiée dans le navigateur avec faux client et faux fournisseur : attente, actualisation, succès, annulation, expiration et indisponibilité SumUp. Aucun encaissement ni SMS réel.
- Session persistante mobile chiffrée, déconnexion explicite, journal de paiement sans coordonnées ni token, fichiers sensibles exclus des archives de compilation.

## Reprise autorisée — iPhone prioritaire

Notifications clients préparées le 19 septembre : préférences séparées, association privée d’appareils, mises à jour de commandes payées/réservations, éditeur promotionnel restaurant et traitement des retours Expo. **Non activées sur téléphone** : la page Credentials du projet Expo a été contrôlée et ne contient encore aucun identifiant Apple ou Android ; aucun `google-services.json` n’est présent. Le propriétaire a maintenant autorisé la reprise des versions de test et précisé qu’il utilise un iPhone. Les exports JavaScript et les tests avec fournisseur simulé ne valident ni la signature ni la réception réelle. Étapes restantes et réglages dans `PUSH_NOTIFICATIONS.md`.

Connexion OAuth terminée par le propriétaire, compte CLI `bibouburgers`. Projet `bibous-burger` dans l’organisation `bibou-and-co` (Bibou & Co), identifiant `2c35adf5-23b6-474e-a790-c8cf39d4d70a`, sauvegardé dans `app.json`. **Pause levée pour les versions installables de test**, pas pour une publication sur les boutiques ni une nouvelle dépense. Connexion Apple effectuée par le propriétaire ; le contrat gratuit « Apple Developer Agreement » a ensuite été accepté avec son autorisation explicite. Communications promotionnelles laissées désactivées et profil personnalisé facultatif ignoré. Le compte affiche « Rejoindre l’Apple Developer Program » : **l’adhésion payante n’est pas active**. Ne pas la souscrire ni accepter un nouveau contrat sans accord spécifique. Aucun binaire signé n’a encore été lancé ; l’historique iOS Expo est vide.

EAS Update n’est pas installé/configuré. Certaines futures modifications de texte, style et images pourraient être distribuées par ce mécanisme compatible avec les règles des boutiques, une fois configuré et inclus dans un binaire. Les changements natifs imposent un nouveau build ; les changements de fonctionnalités doivent respecter la revue des plateformes. Ne pas confondre déploiement web et mise à jour de l’application installée.

L’inscription Apple sur le web est ouverte à l’étape `https://developer.apple.com/enroll/identity/edit`. Prénom, nom et adresse personnelle sont préremplis dans Apple avec l’autorisation du propriétaire ; aucun formulaire d’identité soumis. Aucune copie de l’adresse privée dans ce dépôt. Téléphone encore à confirmer pour Apple. Tarif officiel consulté le 19 septembre : 99 USD par an, prix local affiché pendant l’inscription ; aucun montant exact en euros encore présenté. L’autorisation de préparer la suite ne vaut pas accord de paiement. Source : https://developer.apple.com/programs/enroll/.

Le Mac dispose des Command Line Tools, pas d’une installation Xcode complète sélectionnée ni d’un runtime Java. Les exports de code réalisés ne sont donc pas des compilations natives locales. Utiliser EAS après connexion, sous réserve des conditions et quotas du compte existant ; aucune nouvelle dépense n’a été engagée.

### Intervention regroupée du propriétaire

1. Reprise des versions de test confirmée, iPhone prioritaire : ne pas redemander cette autorisation. La connexion Expo est déjà effectuée ; ne pas recommencer ni demander de transmettre un mot de passe/token.
2. Confirmer/ouvrir les comptes Apple Developer et Google Play Console de Bibou & Co ; toute inscription payante ou acceptation de contrat reste à valider par le propriétaire.
3. Fournir les accès de signature et validations à deux facteurs au moment de créer les builds ; le propriétaire conserve ses identifiants.

Source officielle pour la connexion, les compilations et signatures : [Créer un premier build EAS](https://docs.expo.dev/build/setup/). Les exclusions sont documentées dans [la documentation .easignore](https://docs.expo.dev/build-reference/easignore/).

## Travail à enchaîner dès les accès disponibles

- Vérifier l’adhésion Apple après connexion, enregistrer l’iPhone avec autorisation puis générer le build iOS de test approprié ; préparer ensuite Android avec FCM. Le dépôt est déjà associé au projet Expo du propriétaire. Vérifier le quota/coût de compilation avant lancement et demander accord avant toute dépense.
- Installer sur Android/iPhone réels : connexion et reconnexion SMS, fermeture pendant SumUp, retour de paiement, commandes, créneaux complets, réservation jusqu’à quatre personnes, Bibou +, fidélité, déconnexion et suppression du compte.
- Test réel SMS vers un numéro autorisé par son titulaire, après approbation Twilio. Ne pas recommencer des essais en boucle ni consommer du crédit sans nécessité.
- Captures d’écran issues des vrais builds et visuel Google Play ; reprendre les textes de `STORE_LISTING.md`.
- Finaliser les déclarations de données, les informations commerciales/légales et l’accès de revue. Aucun code SMS universel ni contournement de connexion en production. Si un compte de démonstration est nécessaire, concevoir un environnement isolé des commandes et paiements réels.
- Avant ouverture publique, effectuer un exercice de restauration isolé et conserver une sauvegarde privée hors du disque Render. Les copies automatiques du même disque ne suffisent pas contre la perte de ce disque.
- Soumettre ensuite aux boutiques ; leur validation reste une étape externe et n’est pas garantie.

## Limites d’exploitation à conserver visibles

- Annuler une commande ne rembourse pas la banque : annulation dans le tableau ET remboursement SumUp restent deux actions. La synchronisation automatique des remboursements n’est pas implémentée.
- Bibou + correspond à 30 jours payés, sans renouvellement automatique.
- Serveur JSON mono-instance, limites de connexion en mémoire ; pas de montée en charge multi-instance avant migration transactionnelle.
- Alertes restaurant uniquement lorsque la page est ouverte ; aucune notification push en arrière-plan promise.
- Aucune inscription développeur, achat de service, nouvelle facturation ou publication sur Apple/Google n’a été effectuée pendant cette préparation.
