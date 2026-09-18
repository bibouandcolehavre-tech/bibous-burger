# Préparation Android et iPhone — 18 septembre 2026

## État réel

L’application web et l’API sont déployables. Les exports de code iOS et Android réussissent, mais **aucun APK/AAB/IPA signé n’a encore été généré ni testé sur un appareil réel**. Ne pas présenter l’application comme prête à soumettre aux boutiques tant que les étapes ci-dessous ne sont pas terminées.

## Contrôles réalisés

- 119 tests automatisés : paiements et doublons, annulation, fidélité/parrainage, créneaux, réservations, récompenses, stock, accès privés, sauvegardes, initialisation sans données clients embarquées, limitation des connexions et reprise après interruption.
- Export web et exports Hermes iOS/Android réussis.
- Expo Doctor : 21 contrôles sur 21 réussis.
- Audit des dépendances applicatives : aucune vulnérabilité connue après correctif ciblé UUID, sans mise à niveau majeure du framework.
- Reprise de paiement vérifiée dans le navigateur avec faux client et faux fournisseur : attente, actualisation, succès, annulation, expiration et indisponibilité SumUp. Aucun encaissement ni SMS réel.
- Session persistante mobile chiffrée, déconnexion explicite, journal de paiement sans coordonnées ni token, fichiers sensibles exclus des archives de compilation.

## Blocage de compilation signée observé

`npx eas-cli whoami` répond « Not logged in ». Le projet n’est pas encore associé à un propriétaire/identifiant de projet EAS. Ne pas en inventer un, créer un compte au nom du propriétaire sans son intervention ou choisir un forfait payant.

Le Mac dispose des Command Line Tools, pas d’une installation Xcode complète sélectionnée ni d’un runtime Java. Les exports de code réalisés ne sont donc pas des compilations natives locales. Utiliser EAS après connexion, sous réserve des conditions et quotas du compte existant ; aucune nouvelle dépense n’a été engagée.

### Intervention regroupée du propriétaire

1. Se connecter à son compte Expo dans le terminal avec `npx eas-cli login`, sans communiquer le mot de passe ou un token dans la conversation. Si aucun compte n’existe, le propriétaire le crée et accepte lui-même les conditions.
2. Confirmer/ouvrir les comptes Apple Developer et Google Play Console de Bibou & Co ; toute inscription payante ou acceptation de contrat reste à valider par le propriétaire.
3. Fournir les accès de signature et validations à deux facteurs au moment de créer les builds ; le propriétaire conserve ses identifiants.

Source officielle pour la connexion, les compilations et signatures : [Créer un premier build EAS](https://docs.expo.dev/build/setup/). Les exclusions sont documentées dans [la documentation .easignore](https://docs.expo.dev/build-reference/easignore/).

## Travail à enchaîner dès les accès disponibles

- Associer ce dépôt au bon compte Expo et générer un APK de test Android ; générer le build iOS approprié pour appareil enregistré ou TestFlight.
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
