# Notifications clients — état au 19 septembre 2026

## Ce qui est implémenté

- « Mon compte → Mes notifications » : suivi des commandes/tables et offres promotionnelles, choix indépendants et désactivés par défaut, sauvegarde côté serveur, liste/retrait d’appareils.
- Demande d’autorisation du téléphone seulement après une action explicite. Aucun formulaire web ne prétend autoriser le téléphone. Cette version n’implémente pas le Web Push.
- Suivi en français après paiement confirmé, acceptation, préparation terminée, départ/remise, livraison et annulation ; table confirmée/annulée. Une commande impayée ne déclenche pas d’alerte. Une annulation ne prétend pas rembourser automatiquement.
- Espace restaurant : aperçu de la notification, cible tous les abonnés aux offres ou Bibou +, destination interne, comptage clients/appareils, confirmation d’envoi distincte et historique. Jamais d’envoi au simple aperçu.
- File persistante et prioritaire pour les commandes/tables ; identifiants stables empêchant les doubles envois lors d’un double clic ou d’un callback paiement répété.
- Consentement contrôlé avant l’envoi, opt-out immédiat pour les tâches encore en attente, nettoyage à la déconnexion/suppression du compte, preuve privée de l’installation pour la réassocier. Aucun token brut transmis au tableau restaurant.
- Contrôle des tickets et reçus Expo, retrait des appareils invalides, délais et quotas. « Accepté par le fournisseur » ne signifie pas reçu ou lu sur le téléphone. Aucun suivi d’ouverture publicitaire.

## Blocage concret restant

Le projet Expo `bibous-burger` / organisation `bibou-and-co` est associé (ID `2c35adf5-23b6-474e-a790-c8cf39d4d70a`). Sa page Credentials a été consultée : **aucun identifiant Apple ou Android n’est encore associé**. Aucun fichier `google-services.json` n’est fourni. Le propriétaire a levé la pause sur les versions installables de test et utilise un **iPhone**, à traiter en priorité. Connexion Apple effectuée ; contrat gratuit de développeur accepté avec son autorisation explicite. Le compte propose encore de rejoindre l’Apple Developer Program : **adhésion payante non active**, donc accès de signature/push de cette distribution iPhone non disponible. Aucun achat n’est autorisé à ce stade. Historique des builds iOS Expo consulté : vide.

La reprise des versions installables est autorisée ; il reste les accès nécessaires et l’enregistrement de l’appareil réel. Aucun achat, création de clé ou envoi réel n’a été effectué pendant la préparation. Les exports iOS/Android sont du code compilable, pas des applications signées installables. Expo Go et le site web ne valident pas les push de cette application. Les fichiers privés de signature sont exclus de Git, de l’archive source EAS et de l’image serveur ; utiliser les canaux de gestion des identifiants prévus par Expo.

## Activation, sans reprendre le développement du début

1. **Android** : configurer l’application Firebase pour le package existant `com.bibouandco.bibousburgers`, récupérer sa configuration publique `google-services.json`, la référencer avec `expo.android.googleServicesFile`, puis associer à EAS les identifiants FCM v1 autorisés. La clé de compte de service privée doit rester hors de Git et hors du binaire. Sa création/son accès nécessitent l’autorisation appropriée.
2. **iOS** : disposer du compte Apple Developer adéquat, conserver `com.bibouandco.bibousburgers`, associer signature et clé APNs dans EAS. Connexion, 2FA, contrat ou inscription payante sont réalisés/validés par le propriétaire. Ne pas demander de copier les mots de passe dans la conversation.
3. Générer une version native de test après validation des accès et du quota de compilation. La pause est levée, mais aucune nouvelle dépense ni publication boutique n’est autorisée. Le plugin `expo-notifications`, les canaux Android et le projectId sont déjà configurés.
4. Utiliser d’abord un environnement privé et un seul téléphone dont le titulaire a accepté les essais. Définir `PUSH_ENABLED=true` et seulement la plateforme testée (`PUSH_ANDROID_ENABLED=true` ou `PUSH_IOS_ENABLED=true`). Facultatif : activer la sécurité renforcée Push Expo et définir `EXPO_ACCESS_TOKEN` côté serveur uniquement. Ne jamais exposer ce jeton avec une variable `EXPO_PUBLIC_*`.
5. Installer, se connecter, ouvrir Mes notifications puis activer le suivi. Vérifier demande système, refus puis autorisation, réception app ouverte/en arrière-plan/fermée et navigation au toucher. Utiliser une commande/réservation fictive isolée ; aucun paiement réel nécessaire aux essais techniques.
6. Activer séparément les offres, préparer une campagne test et vérifier le compteur avant confirmation. Vérifier un double clic, un désabonnement avant traitement, le retrait de l’appareil, une déconnexion/reconnexion sur un autre compte et la suppression du compte.
7. Vérifier les retours fournisseur puis activer en production uniquement les plateformes validées. Le bouton restaurant reste verrouillé tant que les envois ne sont pas activés et qu’il n’y a aucun appareil autorisé. Aucun SMS Twilio n’est utilisé par ce système.

## Exploitation et sécurité

- Variables par défaut : `PUSH_ENABLED=false`, `PUSH_IOS_ENABLED=false`, `PUSH_ANDROID_ENABLED=false`. Coupe-circuit global et par plateforme ; pas besoin de modifier les clés de paiement/SMS.
- Envoi par lots de 25, contrôle toutes les 15 secondes, timeout réseau de 10 secondes. Les appels Expo ne bloquent pas les écritures de commandes.
- Deux campagnes promotionnelles au maximum par période de 24 heures, 50 aperçus par jour. Aperçu valable 15 minutes ; seuls les appareils de l’aperçu, toujours rattachés au même compte et toujours consentants, peuvent recevoir la campagne. Une nouvelle personne ne se glisse pas entre aperçu et confirmation.
- Confirmation fournisseur interrogée après 15 minutes, puis toutes les 15 minutes si nécessaire, pendant au maximum 23 heures. Une panne ambiguë d’envoi n’est pas relancée automatiquement (risque de double notification). Seuls les rejets HTTP 429 sont retentés, jusqu’à trois tentatives. Une tâche interrompue en cours d’envoi devient « résultat incertain » ; consulter l’historique, ne pas reconstituer aveuglément une campagne.
- Péremption des notifications : 2 heures pour le suivi, 24 heures pour les offres. Historique technique/campagnes : 7 jours. Appareils inactifs : 90 jours maximum ; les tokens invalides sont retirés.
- Une notification déjà remise au fournisseur peut encore arriver après un désabonnement. Les nouvelles tâches/envois en attente sont bloqués. Aucun contenu personnel (adresse, téléphone, détail bancaire) dans le texte affiché sur l’écran verrouillé.
- Après restauration d’une ancienne sauvegarde : **garder PUSH_ENABLED=false**, réconcilier suppressions de comptes/désabonnements/campagnes déjà envoyées avant toute reprise. Ne pas réexpédier automatiquement un ancien historique. Les sauvegardes privées contiennent les associations d’appareils et doivent être protégées comme les données clients.
- Le service client push ne remplace pas les alertes sonores du tableau restaurant. Le tableau fermé n’a pas de Web Push restaurant dans cette version.
- Les compteurs indiquent des clients et appareils éligibles, puis des états de traitement. Ils ne mesurent ni téléchargements, ni désinstallations exhaustives, ni lecture réelle. L’accès réseau, les réglages du téléphone et le fournisseur peuvent empêcher/retarder l’affichage.

## Vérification sans données réelles

`npm test` comprend les tests unitaires de la file/fournisseur simulé, les routes authentifiées sur une base jetable et les fonctions natives simulées. Les fixtures bloquent tout appel à un fournisseur réel. Les interfaces web ont été contrôlées sur données fictives à 390 px et sur grand écran, avec vérification de persistance des choix et d’absence de débordement. Un test natif sur téléphone reste obligatoire avant de déclarer la fonction opérationnelle.

Documentation officielle : [mise en place Expo](https://docs.expo.dev/push-notifications/push-notifications-setup/), [envoi et reçus](https://docs.expo.dev/push-notifications/sending-notifications/), [API Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [FAQ](https://docs.expo.dev/push-notifications/faq/).
