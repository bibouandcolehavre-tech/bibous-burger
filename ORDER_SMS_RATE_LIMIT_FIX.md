# Correctif des alertes SMS — 27 septembre 2026

## Cause observée

Après plusieurs tests où le premier mobile recevait le SMS mais pas le deuxième, diagnostic à 22:09:32 (Paris) avec ordre des destinataires inversé :

- Mobile fin 50 32 envoyé en premier : challenge Digest 401, puis HTTP 200 / `OK`.
- Mobile fin 94 16 envoyé cinq secondes plus tard : challenge Digest 401, puis **HTTP 500, statusText et corps `Comeback later...`**.

C'est donc un refus temporaire de l'API, pas un numéro systématiquement injoignable. Le guide officiel Keyyo décrit précisément ce refus comme un rejet lié à la limitation de débit. Il annonce un appel API par seconde ; l'essai à cinq secondes montre qu'il ne faut pas se fier uniquement à l'espacement entre les deux SMS. La fenêtre exacte appliquée à ce compte n'est pas établie.

Source : https://docs.keyyo.com/docs/files/2024/01/Keyyo-Guide-dutilisation-CTI-_-API-_-TAPI.pdf, page 4.

## Correction

- Un coordinateur commun par ligne sérialise les envois et espace **chaque requête HTTP**, y compris le challenge Digest et sa réponse, de 1,5 seconde au minimum. Appels et commandes ne peuvent pas envoyer simultanément dans le même processus.
- Pour les **alertes de commandes uniquement**, deux nouvelles tentatives maximum, après 30 puis 60 secondes, exclusivement si HTTP 500 et corps exactement reconnu `Comeback later...` / `Come Back Later`.
- Aucun nouvel essai après `OK`, erreur réseau, réponse perdue, 500 générique, autre code HTTP ou corps ambigu. Les SMS déjà `accepted` / `uncertain` / `rejected` ne sont jamais rejoués aux passages suivants ni à la restauration.
- Après refus temporaire répété : état `rejected`. Les autres échecs restent `uncertain`. Diagnostic conservé sous forme de codes strictement autorisés, statut HTTP et compteur (maximum trois tentatives), jamais de corps, numéro, URL privée ni identifiants Keyyo.
- Avant chaque requête réelle et après toute attente, vérifier que la commande existe encore, est payée, non annulée et que le travail n'a pas plus de 30 minutes.
- L'attente et le réseau restent hors verrou de commandes. Pas de blocage des paiements.
- L'automatisme après appels conserve sa politique sans nouvelle tentative. Aucun changement CTI, SIP, permissions, secrets, destinations, paiement, interface mobile ou dossier Google/Apple.

## Vérifications

- 24 tests ciblés puis **298 tests serveur réussis**, dont sept nouveaux tests à horloge simulée : deux mobiles, authentification, débit commun, refus temporaire, nombre de tentatives borné, annulation pendant l'attente, erreurs ambiguës non réessayées et confidentialité.
- Parcours HTTP isolé : paiement et commandes offertes, deux destinataires, abonnements et commandes historiques exclus.
- `git diff --check` et vérification syntaxique réussis.
- Aucune commande réelle créée lors du diagnostic ; deux tentatives vers les seuls mobiles autorisés, un envoi accepté à 22:09:32. Ce diagnostic est distinct des tests précédents, ne pas le rejouer.

## État

Correctif testé depuis le checkout de production isolé `burger-order-sms`. Mise en ligne et test réel du worker corrigé à confirmer. Ne pas annoncer que les deux alertes sont fiables avant ce contrôle et confirmation de réception.
