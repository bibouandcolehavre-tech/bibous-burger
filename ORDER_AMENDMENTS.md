# Modification du panier avant acceptation

Dans l’espace restaurant, une commande payée « Nouvelle » propose **Modifier le panier**. L’équipe peut changer les produits et leurs options, ajuster les quantités ou retirer une ligne, puis renseigner un motif. L’aperçu affiche les articles recalculés côté serveur, le total et la différence à rembourser. Aucun supplément n’est autorisé : le nouveau total doit être inférieur ou égal au montant payé.

L’envoi place la commande en attente de l’accord du client. Les actions de préparation sont bloquées côté serveur, y compris via l’ancienne route de mise à jour. La proposition peut être révisée avant la réponse ; seule sa dernière version peut être acceptée. Une fois revalidée, elle ne peut plus être modifiée par cette fonctionnalité.

Dans **Mes commandes**, le client voit le motif, le panier initial, le panier proposé, les options et les montants. Il accepte ou refuse. L’acceptation remet la commande en « Nouvelle » pour validation du restaurant ; le refus annule toute la commande. Sans réponse dans les 30 minutes, ou à l’heure du créneau si elle arrive avant, la commande est annulée. Une tâche et les lectures API effectuent cette expiration sous le verrou partagé de la base.

## Notifications

L’application web ouverte vérifie les commandes toutes les 10 secondes et affiche une alerte pour chaque nouvelle version, avec accès au suivi. La demande est persistante dans Mes commandes, y compris après reconnexion. Le navigateur fermé ne reçoit pas de notification web.

Le canal mobile existant est utilisé uniquement si le serveur l’a activé, que le client a accepté les notifications de service et qu’un appareil compatible est enregistré. Chaque proposition et décision a un identifiant distinct. Le restaurant voit quand aucune notification mobile n’a pu être mise en file ; il doit alors prévenir le client par téléphone. La mise en file ne constitue pas une preuve de réception.

La publication web ne met pas à jour une ancienne application native installée. Ces clients doivent ouvrir la version web et se connecter pour revalider jusqu’à la publication d’une nouvelle version native.

## Paiements et remboursements

Aucun nouveau débit ni remboursement automatique n’est effectué. Le montant réellement payé reste conservé dans `paidTotal` après acceptation ; les vérifications SumUp utilisent toujours ce montant. Le total commercial devient celui du panier accepté, utilisé dans le tableau de chiffre d’affaires. Les réductions et avantages livraison de la commande sont conservés.

Une différence ou une annulation crée un remboursement « À effectuer dans SumUp ». La commande reste visible dans Toutes tant que ce remboursement est dû. Après avoir effectué le remboursement dans SumUp, l’équipe peut en consigner la référence. L’interface client parle d’un remboursement **déclaré effectué par le restaurant**, car cette déclaration n’est pas une vérification bancaire automatique. En cas d’annulation après remboursement partiel déjà enregistré, seul le solde est demandé et la première déclaration reste dans l’historique.

## Validation

Tests unitaires et HTTP isolés : droits d’accès, propriété de commande, calcul des prix/remises, stock, refus des suppléments, consentement sur la dernière version, concurrence, répétition de réponse, verrouillage de préparation, expiration, refus, suivi des remboursements, compatibilité du paiement initial et notifications par version.

Parcours navigateur vérifié sur commande fictive : deux Coca à 3,60 € remplacés par un Perrier à 1,80 €, notification dans l’application, affichage des deux paniers, revalidation, retour du nouveau panier au restaurant et remboursement de 1,80 € à traiter. Aucune commande réelle ni paiement réel n’a été modifié pendant ces vérifications.
