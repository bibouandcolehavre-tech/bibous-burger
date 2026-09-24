# Référencement — préparation du 24 septembre 2026

## État vérifié

L’accueil public servi par Render avant cette modification avait `lang="en"`, un titre limité au nom, aucun descriptif, aucune URL canonique, aucune donnée structurée et une racine HTML vide. `/robots.txt` répondait 404. Cela ne prouve pas l’absence d’indexation : Google peut rendre JavaScript, mais le contenu initial était insuffisant.

## Correctifs publiés et présentation

- `npm run build:web` exécute désormais le générateur `scripts/build-web-seo.cjs` après l’export Expo.
- Accueil en français, titre localisé Le Havre, description, canonical sans les paramètres de versions/tests, Open Graph et Twitter.
- À la demande du propriétaire, le grand bloc ajouté en bas de l'accueil est remplacé par un lien discret **« Infos pratiques »** vers `/restaurant-le-havre.html`. Taille du texte 13 px, cible tactile de 44 px, navigation clavier conservée. La vue de chargement HTML est également allégée : elle ne réaffiche plus le long bloc d'adresse/horaires.
- Les informations détaillées restent visibles sur la page publique liée, accessible aux utilisateurs et aux robots, sans détection de Googlebot ni texte caché.
- Page `/restaurant-le-havre.html`, indépendante de JavaScript : services, tarifs de livraison, adresse, horaires, lien vers la commande et réseaux officiels. Elle ne remplace pas l’accueil ni le parcours de commande.
- Données JSON-LD Restaurant/WebSite et fil d’Ariane sur la page d’informations. Aucun avis/note inventé, aucun téléphone personnel publié.
- `robots.txt` et sitemap avec uniquement les deux URL publiques, sans informations privées.
- Titres de catégories de niveau 2 et libellés d’images produits.
- `noindex, nofollow` dans l’espace restaurant. Cela ne remplace évidemment pas son authentification.

Les informations publiques sont regroupées dans `restaurant-info.js`. Les changements futurs d’horaires ou de zone doivent aussi mettre ce fichier à jour et être republiés. Le nom de domaine Render est utilisé tant qu’aucun domaine personnalisé n’a été vérifié.

## Vérifications réalisées

- 217 tests réussis après la reprise, dont 5 tests SEO et 9 tests du prototype partenaires.
- Export web réussi.
- Page d’informations contrôlée en navigateur : texte, image et liens présents, retour au vrai accueil React réussi.
- Pas de commande, de paiement ou de message client créé pendant ces contrôles.

## Publication et Google Search Console — reprise du 24 septembre

La commande Render du service `srv-dam1lqnqj5pc73bgolgg` a été remplacée par `npm ci && npm run build:web`. Déploiement SEO `0f86d7f` réussi (`dep-daqhp1ragvds73d99l4g`), puis balise de validation Search Console `c319d05` publiée avec succès (`dep-daqhtc95efls7397smvg`).

- HTTP 200 vérifiés sur accueil, `robots.txt`, `sitemap.xml`, page restaurant et photo ; titre localisé, langue française, canonical et JSON-LD présents sur l'URL publique. Le tableau restaurant public contient bien `noindex, nofollow`.
- Page d'informations vérifiée à 390 px sans débordement, image chargée. Retour de cette page vers le vrai accueil React vérifié en production (carte, menus, réseaux, avis et services présents).
- Accord explicite du propriétaire obtenu pour ajouter et valider la propriété `https://bibous-burger-app.onrender.com/` dans son compte Google connecté, puis envoyer le sitemap. Google a confirmé **« La propriété a été validée »** via la balise HTML. Ne pas supprimer cette balise des futurs exports.
- `sitemap.xml` envoyé et lu par Google : le tableau affiche désormais **« Opération effectuée »**, dernière lecture le 24 septembre 2026, **2 pages découvertes**. L'erreur de récupération initiale s'est résolue. L'inspection active Google confirmait également une récupération réussie et une exploration autorisée.
- L'inspection de l'accueil indiquait **« Détectée, actuellement non indexée »**, avec ce sitemap comme source de découverte. La demande d'indexation de l'accueil a ensuite abouti au message **« Indexation demandée »**, URL ajoutée à la file d'exploration prioritaire. Cela ne signifie pas que l'indexation ou une position dans les résultats est déjà acquise.
- La propriété existante `bibousburgers.com` et l'ancienne boutique SumUp n'ont pas été modifiées. Aucun DNS, domaine, moyen de paiement ou abonnement changé.

L'apparition et la position dans les résultats restent décidées par Google. Le traitement initial de Search Console est annoncé par Google comme pouvant prendre environ un jour ; ce n'est pas un délai garanti d'indexation. Ne pas annoncer le site déjà premier ni déjà indexé.

## Ancienne boutique SumUp

Le propriétaire souhaite gérer lui-même son retrait du référencement. Effacer un titre ou des mots-clés ne désindexe pas une page. Une vraie directive `noindex` doit être accessible au robot et relue par Google ; bloquer uniquement robots.txt ne suffit pas. Si SumUp autorise des redirections permanentes, privilégier les correspondances utiles vers le nouveau site. Ne rien fermer, supprimer ou rediriger sans vérifier les possibilités et l’accord du propriétaire. Le lien « site web » de la fiche Google et des réseaux devra ensuite viser la nouvelle adresse, sans supprimer la fiche établissement ni ses avis.

### QR codes et domaine — diagnostic du 24 septembre

Le propriétaire précise que les QR codes imprimés pointent initialement vers `https://bibou-s-burgers.sumupstore.com/`, puis qu'il a relié cette adresse à son domaine. Contrôle réel dans le navigateur : cette URL redirige bien vers **`https://bibousburgers.com/`**, qui affiche actuellement **« Boutique temporairement fermée »**.

Les serveurs DNS publics sont `nsa1.squarespacedns.com` à `nsa4.squarespacedns.com`. L'enregistrement A actuel du domaine est `108.128.115.77`. Les MX sont ceux de Google Workspace : **ne pas modifier la messagerie**. Aucun changement DNS, de redirection ou de connexion SumUp n'a été effectué.

Objectif demandé : conserver les QR codes en faisant arriver le domaine sur la nouvelle application. La connexion Squarespace est nécessaire : la page de gestion des domaines ouvre un formulaire de connexion, et le propriétaire a été invité à se connecter lui-même. Avant toute bascule, relever les réglages existants, choisir une redirection HTTPS ou un raccordement du domaine selon les options disponibles, et tester ensuite le parcours complet depuis l'URL SumUp. Ne pas supprimer ni déconnecter aveuglément la boutique : le premier maillon du QR dépend encore de SumUp. Le service de paiement SumUp doit rester intact.

Documentation officielle consultée : https://support.squarespace.com/hc/en-us/articles/214767107-Forwarding-a-domain et https://render.com/docs/custom-domains.

Sources officielles consultées :
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- https://developers.google.com/search/docs/appearance/structured-data/local-business

## Autres travaux à reprendre sans les confondre avec ce déploiement

- Le prototype multi-restaurant `partner-console/` est désormais **interactif**, local et non connecté : fiches fictives, neuf modules, dépendances, identité, aperçu, sauvegarde avec récapitulatif, historique et tests. Adresse locale : `http://127.0.0.1:4176/`. Aucun effet sur les restaurants réels ; l'isolation opérationnelle multi-tenant reste à construire. Voir `MULTI_RESTAURANT_PLAN.md`.
- Build Android Firebase `0dca4bd5-19e1-4b37-8d7f-c07bb39caede` terminé et APK **installé avec succès** sur le téléphone virtuel `emulator-5554`, en conservant les données. L'association du token et la réception d'une notification restent à tester. Les interrupteurs push de production n'ont pas été activés.
- Demande prioritaire suivante : piloter cette tâche depuis l’iPhone. Documentation OpenAI Remote vérifiée. Association requise via Paramètres > Connexions > Contrôler ce Mac. Les essais officiels CLI ont échoué (service de contrôle absent puis CLI intégrée sans paquet complet) ; aucune activation distante ni association n’est confirmée. Ne pas installer un autre service ni exposer un port public pour contourner ce point.
