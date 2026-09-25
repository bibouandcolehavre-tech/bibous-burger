# Uber Direct — choix commande par commande

L’intégration est désactivée tant que le serveur n’a pas les accès Uber et la clé de signature des événements. Aucun appel Uber ni coursier n’est créé par défaut.

## Parcours restaurant

1. Accepter une commande payée en livraison. Tout panier modifié doit déjà avoir été revalidé par le client.
2. Cliquer **Obtenir un devis Uber Direct**, indiquer quand la commande sera prête (maintenant, 10, 20 ou 30 minutes), puis calculer le devis.
3. Vérifier le tarif facturé au restaurant, l’estimation et sa compatibilité avec le créneau client. Le devis ne modifie pas le montant payé par le client.
4. Confirmer explicitement le montant pour demander le coursier. Si l’estimation sort du créneau ou est absente, l’équipe doit d’abord prévenir le client et cocher la confirmation correspondante.
5. Suivre le coursier dans la commande. Une synchronisation est effectuée par événements signés, avec une actualisation de secours chaque minute et un bouton manuel.

La demande est possible le jour du service, de 90 minutes avant à 30 minutes après le début du créneau. Les horaires Uber sont des estimations, pas une garantie du créneau de 30 minutes. La zone et les frais déjà présentés au client restent ceux du restaurant.

Le retour au restaurant est demandé si la livraison est impossible ; Uber peut facturer des frais supplémentaires. L’annulation de course se fait dans Uber Direct, puis le restaurant actualise le suivi. L’annulation de course ne signifie pas automatiquement l’annulation ni le remboursement de la commande alimentaire.

## Connexion serveur

Configurer uniquement sur le service API Render, jamais dans le frontend ni dans Git :

- `UBER_DIRECT_ENABLED=true`
- `UBER_DIRECT_MODE=test` pour les essais, `live` pour les courses réelles
- `UBER_DIRECT_CUSTOMER_ID` depuis le compte Uber Direct
- `UBER_DIRECT_CLIENT_ID` et `UBER_DIRECT_CLIENT_SECRET` du même environnement
- `UBER_DIRECT_WEBHOOK_SECRET` : clé de signature du webhook correspondant
- `UBER_DIRECT_PICKUP_PHONE=+33278088498` (numéro restaurant observé, à vérifier lors de la connexion)

Adresse de retrait : Bibou’s Burgers, 153 Quai George V, 76600 Le Havre, France.

Configurer un webhook **event.delivery_status** vers :

`https://bibous-burger.onrender.com/api/uber-direct/webhook`

La facturation et les autorisations de production doivent être valides dans Uber Direct. Ne pas utiliser les clés de production pour des essais supposés gratuits. Les essais automatiques du dépôt utilisent un fournisseur simulé sans réseau Uber.

## Sécurité et reprise

- OAuth serveur, portée `eats.deliveries`, secrets exclus des réponses et du code client.
- Devis lié à une empreinte du panier, de l’adresse et du créneau ; prix et expiration contrôlés côté serveur.
- Une réservation de demande est écrite avant l’appel Uber sous le verrou partagé de la base. Les appels réseau n’immobilisent pas ce verrou.
- En cas de réponse perdue, la demande est marquée à vérifier. Une seconde course est bloquée. Un événement signé peut retrouver la demande via `external_id`. Sinon, l’équipe retrouve l’identifiant `del_` dans Uber Direct et l’associe par actualisation ; le serveur vérifie l’identifiant externe et l’environnement.
- Après échec explicite sans création, un nouveau devis est possible. Après création, aucun deuxième coursier n’est créé automatiquement, même si la course est annulée.
- Signature HMAC SHA-256 sur les octets exacts, vérification du compte et du mode test/réel. Événements anciens ou régressifs ignorés. Une course annulée/retournée ne peut pas redevenir en livraison.
- Les étapes récupérée/livrée mettent à jour la commande ; les boutons manuels incompatibles sont bloqués pendant une course.
- Le client reçoit uniquement le statut, les estimations et un lien HTTPS Uber autorisé. Le devis payé par le restaurant n’est pas ajouté à sa facture.
- Les commentaires libres ne sont pas transmis automatiquement. Le client est informé du prestataire dans le parcours de livraison et la confidentialité.

## Vérifications

251 tests réussis, dont tests de droits d’accès, double confirmation concurrente, coupure de réponse, signature invalide, événements répétés/anciens, mode test/réel, empreinte du panier, tarif et redirection sûre. Correction associée : les créneaux de livraison présentés comme intervalles sont également reconnus par le parcours de revalidation du panier.

Interface vérifiée avec une commande et un fournisseur fictifs : devis de 6,50 €, préparation dans 10 minutes, confirmation explicite et affichage « Recherche de coursier ». Aucun test n’a demandé une course réelle.

## Références officielles

- [Démarrage et devis](https://developer.uber.com/docs/deliveries/get-started)
- [Authentification](https://developer.uber.com/docs/deliveries/guides/authentication)
- [Signature des webhooks](https://developer.uber.com/docs/deliveries/guides/webhooks)
- [Statuts de livraison](https://developer.uber.com/docs/deliveries/daas/references/api/webhooks/delivery-status-webhook)
- [Fenêtres de livraison](https://developer.uber.com/docs/deliveries/guides/delivery-window)
