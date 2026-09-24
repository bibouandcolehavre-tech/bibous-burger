# Téléphone Android de test — 24 septembre 2026

Un téléphone Android virtuel est installé sur le Mac Intel du projet. Aucun téléphone Android physique ni abonnement supplémentaire n’a été nécessaire.

## Ouvrir le téléphone

Dans le dossier parent de ce dépôt, double-cliquer sur **Lancer Android Bibou.command**. Le raccourci démarre le téléphone si nécessaire, attend Android puis ouvre Bibou’s Burgers. Laisser la fenêtre du téléphone ouverte pour les essais ; sa fermeture arrête l’émulateur.

- Appareil : `Bibou_Test_Android`, profil Pixel 5, Android 15 / API 35, services Google Play, x86_64.
- SDK et moteur Java : `/Users/nowar/Library/Android/`.
- Configuration et disque du téléphone : `/Users/nowar/.android/avd/Bibou_Test_Android.avd/`.
- Application : `com.krokly.bibousburgers`.
- Les téléchargements APK sont conservés dans `/Users/nowar/Library/Android/downloads/`.

## Corrections révélées par les essais natifs

La première compilation `ed44ecec-fdd6-4b6f-8db6-ce0c20fa7662` se fermait au lancement : React Native définit `window`, mais pas ses fonctions d’écoute du focus du navigateur. La correction `4ddd617` réserve ces écouteurs au web. Le retour au premier plan natif continue à utiliser `AppState`, y compris pour la reprise d’un paiement.

La seconde compilation `d751b992-07b3-4f1f-b0d3-080cd7b32152` démarre et permet le parcours invité. L’affichage sous les barres système Android a ensuite conduit à la correction `d62ebe5`, qui applique les marges du téléphone autour de tous les écrans, boutons fixes compris.

Compilation avec les deux corrections :
https://expo.dev/accounts/bibou-and-co/projects/bibous-burger/builds/fd9713e7-2959-466e-bf56-ea124cdbb9f9

## Vérifications

- Tests automatisés : 198 réussis ; quatre régressions couvrent le focus Android, iOS, web et le pré-rendu web.
- Export web réussi après les corrections.
- Expo Doctor : 21/21 après ajout de `react-native-safe-area-context`.
- Parcours invité observé sur la seconde compilation : menu Duck, viande, roquette, Coca, panier à 18,90 €, livraison estimée à 3,99 €, proposition Bibou +, écran de connexion SMS et retour depuis l’arrière-plan sans crash.
- Dernière compilation `fd9713e7-2959-466e-bf56-ea124cdbb9f9` installée et ouverte : marges système vérifiées à l’écran, bouton Retour utilisable sur la connexion et les réservations, accueil restauré après passage en arrière-plan. Le processus reste vivant, sans nouvelle erreur dans son journal de crash.
- Réservations sur la dernière compilation : affichage des heures fixes 12:00, 12:15, 12:30, etc., disponibilités du lendemain chargées, limite de quatre personnes vérifiée (bouton + désactivé à quatre). Aucune réservation envoyée.
- Raccourci `Lancer Android Bibou.command` testé avec le téléphone déjà démarré ; le démarrage à froid du téléphone a été effectué séparément lors de l’installation.

Les essais invités décrits ci-dessus n'ont créé aucun compte client, envoyé aucun SMS, validé aucune réservation ni déclenché de paiement.

Le propriétaire a ensuite effectué lui-même sa connexion SMS et validé l'écran d'anniversaire facultatif. L'espace client et la disponibilité du cadeau de bienvenue −10 % ont été constatés ; la session a été conservée après fermeture complète puis redémarrage de l'application. Aucun code ni donnée d'anniversaire n'est recopié ici. Le calcul réel de remise au paiement n'a pas été retesté pendant cette vérification.

Les notifications distantes restent à tester séparément. L'APK installé rejette encore les simulateurs via `Device.isDevice`. Le code source a été adapté pour permettre un émulateur Android avec Google Play et testé (202 tests réussis au total), mais la prochaine compilation attend la configuration Firebase/FCM décrite dans `PUSH_NOTIFICATIONS.md`. La simple présence des services Google Play ne suffit donc pas à activer les notifications dans l'APK actuellement installé.

Les captures locales et le journal du crash initial sont conservés dans le dossier parent `tests-android-2026-09-24/`. Les fichiers opérationnels `server/data.json` et les modifications préexistantes de `RELEASE_READINESS.md` n’ont pas été inclus dans ces commits.
