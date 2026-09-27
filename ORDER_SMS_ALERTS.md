# Alertes SMS de nouvelles commandes — 27 septembre 2026

## Autorisation et périmètre

Le propriétaire a demandé un SMS à chaque commande et confirmé deux mobiles destinataires ainsi que la facturation Keyyo. Les numéros restent dans les variables privées Render, jamais dans Git. Ne pas ajouter de destinataires ni de campagnes client.

- Livraison et retrait : alerte après confirmation serveur du paiement, ou validation d'une commande intégralement offerte (CHORUS).
- Ni panier abandonné, paiement en attente/échoué, abonnement Bibou + seul, réservation de table, ni accès de revue Google/Apple.
- Aucun rattrapage des commandes historiques au démarrage. Les paiements d'anciennes commandes encore en attente qui deviennent réellement confirmés sont de nouveaux événements.
- Deux SMS au maximum par nouvelle commande : un pour chacun des deux mobiles configurés, dédupliqués après normalisation.
- Contenu ASCII limité à un segment GSM-7 : référence, retrait/livraison, date, créneau, montant, lien du tableau restaurant. Aucun nom, téléphone, adresse, commentaire ou article client.
- L'acceptation de la requête par Keyyo ne prouve pas la livraison au téléphone. La facturation et la réception dépendent de l'opérateur.

## Sécurité et fiabilité

- File `database.restaurantOrderSms` persistée atomiquement avec la confirmation de commande, sous le verrou de la base ; déduplication par marqueur sur la commande et jobs séparés par destinataire.
- Les numéros de destination ne sont pas copiés dans la base : empreinte HMAC avec la clé privée Keyyo existante. Ne pas changer cette clé sans migration.
- Envoi hors du verrou de commandes, avec délai maximum réseau existant de 12 s par requête Keyyo, traitement séquentiel toutes les 1,5 s. Aucun blocage du paiement par un échec de SMS.
- Réservation persistée avant l'envoi. Après crash ou résultat ambigu, état `uncertain`, **aucune relance automatique** pour éviter une double facturation. Un échec vers un mobile n'empêche pas l'autre envoi.
- Messages en attente depuis plus de 30 minutes expirés. Annulation avant envoi, suppression de commande ou retrait du destinataire : aucun envoi. Un SMS déjà envoyé ne peut pas être rappelé.
- Maximum 200 travaux actifs, historique 30 jours ; erreurs de mise en file signalées dans le diagnostic. Aucune promesse de livraison garantie : conserver les alertes du tableau restaurant.
- Sauvegardes : jobs en attente/en cours neutralisés, pas de rejeu à la restauration. Ni message ni téléphone dans cette partie de l'export de sauvegarde.
- Diagnostic protégé `GET /api/dashboard/order-sms` : activation, configuration, nombre de destinataires, compteurs par état, erreurs de file ; aucun numéro ni secret.
- Utilise l'envoi Keyyo existant sans modifier SIP, CTI ou le routage téléphonique. Interrupteur distinct de `KEYYO_CALL_SMS_ENABLED`.

## Activation

Paramètres du serveur API uniquement :

```text
RESTAURANT_ORDER_SMS_ENABLED=true
RESTAURANT_ORDER_SMS_RECIPIENTS=<mobile autorisé 1>,<mobile autorisé 2>
```

Les paramètres `KEYYO_LINE`, `KEYYO_SIP_PASSWORD`, `KEYYO_WEBHOOK_SECRET` et `KEYYO_SMS_PRIVACY_KEY` existants sont réutilisés sans les copier dans le dépôt. Arrêt : `RESTAURANT_ORDER_SMS_ENABLED=false`, en conservant le registre. Ne pas redémarrer pour rejouer un SMS incertain.

## Contrôles avant déploiement

- 291 tests réussis : sept tests unitaires ajoutés et un parcours HTTP isolé avec deux faux mobiles, de faux paiements, retrait, livraison offerte, callbacks répétés, historique et abonnement exclus.
- Tests d'envoi isolés : aucune requête réelle à Keyyo/SumUp, aucune commande réelle créée.
- Configuration invalide/inactive, annulations, délais, saturation, échec de disque avant tentative, panne d'un destinataire, reprise et sauvegarde contrôlés.
- `node --check server/server.js` et `git diff --check` réussis.
- Développement isolé depuis le commit de production `2575914`, dans `../burger-order-sms`, branche `codex/order-sms-alerts`. Les préparatifs iPhone non publiés du dossier principal sont exclus de cet envoi. Aucun changement du code mobile/web ou des boutiques.

## État de déploiement

Code testé, activation Render en cours. Ne pas annoncer la réception des SMS avant confirmation sur les téléphones. État exact final à consigner après contrôle du service et du fournisseur.

Source opérateur consultée : https://www.keyyo.com/fr/telephonie-api/envoi-sms
