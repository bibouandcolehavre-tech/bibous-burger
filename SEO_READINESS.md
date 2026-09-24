# Référencement — préparation du 24 septembre 2026

## État vérifié

L’accueil public servi par Render avant cette modification avait `lang="en"`, un titre limité au nom, aucun descriptif, aucune URL canonique, aucune donnée structurée et une racine HTML vide. `/robots.txt` répondait 404. Cela ne prouve pas l’absence d’indexation : Google peut rendre JavaScript, mais le contenu initial était insuffisant.

## Correctifs locaux

- `npm run build:web` exécute désormais le générateur `scripts/build-web-seo.cjs` après l’export Expo.
- Accueil en français, titre localisé Le Havre, description, canonical sans les paramètres de versions/tests, Open Graph et Twitter.
- Informations publiques visibles dans le HTML initial puis dans le bas de l’accueil React : même contenu pour utilisateurs et robots, sans détection de Googlebot ni texte caché.
- Page `/restaurant-le-havre.html`, indépendante de JavaScript : services, tarifs de livraison, adresse, horaires, lien vers la commande et réseaux officiels. Elle ne remplace pas l’accueil ni le parcours de commande.
- Données JSON-LD Restaurant/WebSite et fil d’Ariane sur la page d’informations. Aucun avis/note inventé, aucun téléphone personnel publié.
- `robots.txt` et sitemap avec uniquement les deux URL publiques, sans informations privées.
- Titres de catégories de niveau 2 et libellés d’images produits.
- `noindex, nofollow` dans l’espace restaurant. Cela ne remplace évidemment pas son authentification.

Les informations publiques sont regroupées dans `restaurant-info.js`. Les changements futurs d’horaires ou de zone doivent aussi mettre ce fichier à jour et être republiés. Le nom de domaine Render est utilisé tant qu’aucun domaine personnalisé n’a été vérifié.

## Vérifications réalisées

- 208 tests réussis, dont 5 nouveaux tests SEO.
- Export web réussi.
- Page d’informations contrôlée en navigateur : texte, image et liens présents, retour au vrai accueil React réussi.
- Pas de commande, de paiement ou de message client créé pendant ces contrôles.

## Pas encore publié — point de reprise indispensable

Render utilise actuellement la commande `npm ci && npx expo export --platform web --output-dir dist` (service `srv-dam1lqnqj5pc73bgolgg`). Elle contourne `build:web`. Il faut la remplacer par `npm ci && npm run build:web` pour intégrer les nouveaux fichiers au déploiement. Cette configuration n’a PAS été modifiée pendant la préparation. Ne pas annoncer le SEO en ligne avant vérification du HTML, du sitemap et de la page sur l’URL publique.

À compléter : contrôle petit écran, publication du code, commande Render, vérification de production, puis propriété Google Search Console et soumission du sitemap si l’accès est disponible. La position Google n’est jamais garantie.

## Ancienne boutique SumUp

Le propriétaire souhaite gérer lui-même son retrait du référencement. Effacer un titre ou des mots-clés ne désindexe pas une page. Une vraie directive `noindex` doit être accessible au robot et relue par Google ; bloquer uniquement robots.txt ne suffit pas. Si SumUp autorise des redirections permanentes, privilégier les correspondances utiles vers le nouveau site. Ne rien fermer, supprimer ou rediriger sans vérifier les possibilités et l’accord du propriétaire. Le lien « site web » de la fiche Google et des réseaux devra ensuite viser la nouvelle adresse, sans supprimer la fiche établissement ni ses avis.

Sources officielles consultées :
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- https://developers.google.com/search/docs/appearance/structured-data/local-business

## Autres travaux à reprendre sans les confondre avec ce déploiement

- Le prototype multi-restaurant `partner-console/` est **inachevé**, local et non connecté : modèle, HTML et CSS créés, mais `app.js`, serveur local et tests restent à faire. Aucune modification des restaurants réels.
- Build Android Firebase `0dca4bd5-19e1-4b37-8d7f-c07bb39caede` terminé avec succès le 24 septembre à 12:27 UTC. APK disponible sur Expo ; installation et test de réception d’une notification pas encore faits. Les interrupteurs push de production n’ont pas été activés.
- Demande prioritaire suivante : piloter cette tâche depuis l’iPhone. Documentation OpenAI Remote vérifiée. Association requise via Paramètres > Connexions > Contrôler ce Mac. Les essais officiels CLI ont échoué (service de contrôle absent puis CLI intégrée sans paquet complet) ; aucune activation distante ni association n’est confirmée. Ne pas installer un autre service ni exposer un port public pour contourner ce point.
