# Redirection de l'ancien site — 24 septembre 2026

## Demande confirmée

Le propriétaire a confirmé l'envoi automatique de l'ancien site vers `https://bibous-burger-app.onrender.com/`, y compris les anciennes fiches produits vers l'accueil. Redirection permanente 301, sans conservation des chemins. Il a précisé que les QR codes mènent à la fiche Google et ne font pas partie de cette intervention.

Le navigateur a confirmé le parcours initial : `https://bibou-s-burgers.sumupstore.com/` → `https://bibousburgers.com/` → boutique SumUp temporairement fermée.

## État avant intervention — valeurs publiques de restauration

Gestionnaire : Squarespace, domaine actif `bibousburgers.com`. Aucune règle de redirection configurée dans le gestionnaire.

- Enregistrement personnalisé : `@`, type `A`, valeur `108.128.115.77`, TTL `14400`.
- Enregistrement personnalisé à conserver : `@`, type `TXT`, valeur `google-site-verification=uWFuwIxu6NDf0hg44hWYzFFf0tAxRyBprnclC7qcGYU`, TTL `14400`.
- Préréglage Google Workspace à conserver : cinq `MX` sur `@`, TTL `14400` : `aspmx.l.google.com` (priorité 1), `alt1.aspmx.l.google.com` et `alt2.aspmx.l.google.com` (5), `alt3.aspmx.l.google.com` et `alt4.aspmx.l.google.com` (10).
- Serveurs de noms à conserver : `nsa1.squarespacedns.com` à `nsa4.squarespacedns.com`.

## Opération réalisée

La première tentative de création de la règle a été refusée par Squarespace : « Impossible d’enregistrer cette règle de redirection de domaine ». La documentation officielle associe cette erreur à un conflit avec un enregistrement A/AAAA/ALIAS/CNAME du même nom. Après vérification e-mail du propriétaire, seul l'ancien A `@` a été retiré. Le TXT Google et les cinq MX Google Workspace ont été conservés.

Source : https://support.squarespace.com/hc/en-us/articles/214767107-Forwarding-a-domain (section de dépannage « Unable to save this domain forwarding rule »).

La règle a ensuite été créée avec succès dans Squarespace : de `bibousburgers.com` vers `bibous-burger-app.onrender.com`, **redirection permanente 301**, option **ne pas rediriger le chemin**. L'interface confirme la prise en charge de HTTP et HTTPS et affiche « La règle de redirection de domaine a bien été créée ». Délai de mise en service annoncé par Squarespace : 24 à 48 heures.

## Vérifications après création

- Résolution DNS publique : A `198.49.23.144`, `198.49.23.145`, `198.185.159.144`, `198.185.159.145` ; les cinq MX sont identiques à l'état initial.
- Test réel du navigateur : ouverture de `https://bibou-s-burgers.sumupstore.com/` → **`https://bibous-burger-app.onrender.com/`**, application et carte chargées.
- Test d'un vrai ancien produit : `https://bibou-s-burgers.sumupstore.com/article/menu-a-travers-les-montagnes-burger-frites-et-boisson-1` → même accueil de l'application ; rubrique « Nos menus » visible.
- Test HTTP du domaine : 301 vers HTTPS. Un contrôle HTTPS via un autre client réseau a encore rencontré un délai de connexion pendant la propagation. Ne pas promettre que tous les réseaux ont déjà basculé ; les deux tests navigateur complets ont réussi.
- Aucun changement du compte SumUp, des paramètres de paiement, de la fiche Google ou des QR codes. Aucun achat, SMS ou commande de test créé.

Retour arrière si nécessaire : retirer la nouvelle règle de redirection, puis recréer le A `@` avec la valeur et le TTL relevés ci-dessus. Ces réglages réseau sont restaurables ; aucune donnée de boutique ou client n'est à supprimer.
