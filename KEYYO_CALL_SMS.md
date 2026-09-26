# SMS automatiques après appel Keyyo

## Demande et autorisations — 26 septembre 2026

- SMS automatique pour les mobiles français 06/07 après un appel au restaurant, décroché ou manqué, **sans menu vocal**. Pas d'inscription aux campagnes marketing ni de compte client créé.
- Le propriétaire a explicitement accepté la facturation à l'usage même avant connaissance du tarif et demandé de se renseigner en parallèle. Aucun abonnement/option payante supplémentaire autorisé.
- Il a autorisé l'activation API, la transmission des numéros Keyyo au serveur privé Render et le stockage serveur du mot de passe SIP existant. **Ne pas changer/réinitialiser le mot de passe SIP ni le routage**.
- Avertissement CNIL fourni : appeler ne constitue pas en soi un consentement à recevoir de la prospection. L'envoi non sollicité d'un lien commercial ne devient pas automatiquement conforme parce que le texte est neutre ou dispose d'un lien d'opposition. Le propriétaire refuse le menu de consentement. Ne pas prétendre que son accord remplace celui des destinataires.

## État de reprise

- Keyyo Manager : ligne `0278088499` / `33278088499`, offre Pack Pro Maxi - Box 36 mois, option SMS déjà présente.
- Le Manager signale encore un blocage au 29/09. Le propriétaire dit avoir réglé l'impayé. Ne pas modifier la facturation ni annoncer que le blocage est levé sans confirmation.
- API serveur initialement décochée. Case cochée **dans le formulaire non enregistré** pour afficher les champs URL de notification / IP source. Aucune sauvegarde d'activation effectuée à ce stade.
- Assistance contactée via le formulaire, catégorie « Poser une question sur nos API ». Confirmation visible : « Votre message a bien été envoyé, nous allons prendre contact avec vous rapidement. » Réponse demandée à `contact@bibousburgers.com`, ligne professionnelle du compte.
- Demande : tarif SMS/segments/frais, couverture CTI des appels décrochés/manqués/hors horaires derrière le numéro d'accueil, accès restreint/sécurisation et gestion de STOP. Aucune modification de contrat ou routage demandée à Keyyo.
- Grille tarifaire PDF du Manager, juillet 2026, rubrique Centrex pages 14–15 : pas de tarif SMS identifié. Pas de prix inventé.
- Mot de passe SIP existant récupéré via « Associer un équipement > Autre » (simple affichage des paramètres). Aucun nouvel équipement associé, aucune réinitialisation effectuée.
- Les cinq variables `KEYYO_*` sont enregistrées dans Render par « Save only ». Deux secrets indépendants de 32 octets générés avec Web Crypto ; aucun secret dans Git. `KEYYO_CALL_SMS_ENABLED=true` prendra effet au prochain déploiement, mais aucune URL de notification n'est encore enregistrée chez Keyyo.
- Code préparé localement, **270 tests réussis**. **Pas encore déployé, pas de notification Keyyo reliée, pas de SMS réel envoyé.** Mettre ce paragraphe à jour après chaque vérification effective.

## Fonctionnement préparé

- `server/keyyo-call-sms.js` + routes dans `server/server.js`, inactifs par défaut. Aucun accès à `server/data.json`, ni aux SMS Twilio de connexion.
- Déclenchement à `SETUP` (arrivée de l'appel), sans condition de décroché. CONNECT/RELEASE ne renvoient pas de SMS. Ainsi le message peut arriver pendant la sonnerie ; ne pas présenter cela comme un envoi exclusivement après raccrochage.
- Filtrage strict de la ligne et du destinataire appelé. Numéros masqués, fixes, étrangers et appels sortants exclus.
- Déduplication persistante par session d'accueil, sinon référence d'appel, et numéro pseudonymisé. Les multiples événements d'un même appel ne coûtent pas plusieurs SMS.
- Secret de notification constant-time, horodatage fournisseur exigé avec fenêtre de 10 minutes. HTTPS seulement, authentification Digest SIP ; aucune autorisation globale des IP Render.
- File persistante séparée, un travail à la fois et au maximum une tentative SMS toutes les 1,1 seconde ; 100 travaux en attente maximum, expiration après 10 minutes.
- Réservation persistée avant envoi : une réponse perdue/crash est « uncertain » et n'est jamais retentée automatiquement (évite les SMS et frais en double). « accepted » = OK fournisseur, **pas** preuve de livraison au téléphone.
- Numéro en clair uniquement pendant l'attente, supprimé avant tentative ; historique pseudonymisé 30 jours. Oppositions pseudonymisées conservées tant que le système fonctionne. Lien STOP GET sans mutation, confirmation POST, aucun compte requis. Conserver `KEYYO_SMS_PRIVACY_KEY` stable pour respecter les oppositions.
- SMS de 142 caractères ASCII, 1 segment GSM-7 théorique : `Bibou's Burgers : commandez ici https://bibous-burger-app.onrender.com/ Stop SMS : https://bibous-burger.onrender.com/s/<jeton>`.
- Le vieux guide PDF Keyyo indique une longueur de champ MSG 64 alors que son API web ne précise pas cette limite : longueur réelle et segments demandés à l'assistance, à vérifier au test réel, ne pas affirmer la réception avant test.

## Configuration et mise en service restante

1. Identifier le mot de passe SIP **existant** sans le réinitialiser ; si seule une réinitialisation est proposée, demander au propriétaire de fournir l'existant dans Render, pas dans le chat.
2. Vérifier la relation numéro d'accueil public -> ligne `33278088499`. Les appels arrêtés au standard avant d'atteindre la ligne peuvent ne pas déclencher le CTI de la ligne. Confirmer couverture avec Keyyo et test réel sans toucher aux horaires/routages.
3. Déployer après tests puis enregistrer seulement côté serveur Render :
   - `KEYYO_LINE=33278088499`
   - `KEYYO_WEBHOOK_SECRET` : au moins 32 octets aléatoires base64url.
   - `KEYYO_SMS_PRIVACY_KEY` : autre secret stable, même taille.
   - `KEYYO_SIP_PASSWORD` : mot de passe existant. Aucun secret dans Git ou le chat.
   - `KEYYO_CALL_SMS_ENABLED=true` seulement quand la chaîne est prête.
4. URL de notification (remplacer seulement `<SECRET>`, conserver les variables Keyyo) :

   `https://bibous-burger.onrender.com/api/keyyo/call?key=<SECRET>&account=_ACCOUNT_&caller=_CALLER_&callee=_CALLEE_&type=_N_TYPE_&callref=_CALLREF_&session=_SESSION_ID_&ts=_TSMS_`

   Ne pas journaliser cette URL complète ni désactiver TLS. Laisser la regexp d'IP source vide pour Digest. Secret dans l'URL = risque de fuite via journaux opérateur/hébergeur ; accès restreint aux journaux et rotation en cas de fuite.
5. Garder une seule instance API sur disque persistant. L'export de sauvegarde inclut `data.keyyoCallSms` : oppositions et déduplication sans numéros ni secrets, messages en attente neutralisés pour empêcher un rejeu. En restauration, conserver/rapprocher aussi `keyyo-call-sms.json` et sa clé privée (celle-ci n'est jamais incluse dans l'export). Ne jamais effacer ce registre pour tenter de rejouer un SMS.
6. Tester appel décroché puis manqué depuis un mobile du propriétaire, valider réception et lien web, unicité de l'envoi et opposition. Demander une action téléphonique au propriétaire si nécessaire. Aucun SMS d'essai à des clients réels.
7. `GET /api/dashboard/keyyo-sms` protégé par accès restaurant expose seulement les compteurs, jamais les numéros, secrets ou messages.
8. Retrait simple : `KEYYO_CALL_SMS_ENABLED=false` puis retirer uniquement notre URL CTI ; conserver les oppositions et le routage original.

## Sources

- https://www.keyyo.com/fr/telephonie-api/notification-appels
- https://www.keyyo.com/fr/telephonie-api/envoi-sms
- https://docs.keyyo.com/docs/files/2024/01/Keyyo-Guide-dutilisation-CTI-_-API-_-TAPI.pdf
- https://www.cnil.fr/fr/la-prospection-commerciale-par-sms-mms
