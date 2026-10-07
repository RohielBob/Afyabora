# ADR-0007 — Nom « Afyabora » et identifiants techniques internes

- **Statut :** Accepté
- **Date :** 2026-10-07
- **Décideurs :** le groupe (choix du nom) ; équipe de développement (périmètre du renommage)

## Contexte

Le cahier des charges (§15, décision 2) laissait le nom ouvert (« Glyka » ou une alternative). Le groupe a choisi **Afyabora** et validé un logo (goutte rouge, « Afya » bleu marine, « bora » rouge corail). Le dépôt GitHub s'appelle déjà `Afyabora`, alors que le code utilise partout le nom provisoire `glyka` (packages `@glyka/*`, base de données, clés de stockage, etc.).

## Décision

- **Tout ce que l'utilisateur voit ou reçoit s'appelle Afyabora** : nom de l'application, textes, avertissement d'usage, nom de l'expéditeur des e-mails, titre du portail, icône, écran de lancement, logo.
- **Les identifiants techniques internes restent `glyka`** : packages `@glyka/*`, noms d'import, utilisateur et base PostgreSQL, fichier SQLite `glyka.db`, clés SecureStore `glyka.*`, `slug` et `scheme` Expo, nom du dossier du dépôt local.
- Le renommage interne se fera **au fur et à mesure**, uniquement quand on touche déjà le fichier concerné.

## Alternatives étudiées

| Option                                             | Avantages                                                 | Inconvénients                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Tout renommer d'un coup (`@afyabora/*`…)           | Un seul nom partout                                       | Touche presque tous les fichiers, le lockfile, les imports ; risque de casser l'installation en plein démarrage du projet |
| **Renommer seulement ce qui est visible (retenu)** | Aucun risque technique, effet immédiat pour l'utilisateur | Deux noms cohabitent dans le code                                                                                         |
| Garder « Glyka » partout                           | Rien à faire                                              | Contraire à la décision du groupe                                                                                         |

## Conséquences

- Deux noms cohabitent dans le code : c'est assumé et documenté ici. **Règle : tout texte affiché à un utilisateur, envoyé par e-mail, écrit dans un PDF ou publié dans un store utilise « Afyabora ».** Avant chaque démo, vérifier qu'aucun « Glyka » n'est visible.
- **Point à trancher AVANT le premier build EAS / la première publication :** l'identifiant Android (`com.glyka.app`) et l'identifiant iOS (`com.glyka.app`) deviennent **définitifs** une fois l'application publiée dans un store. S'ils doivent devenir `com.afyabora.app`, c'est maintenant (aucun build n'existe) ou jamais.
- Les données de démonstration (`@demo.glyka.local`) et les titres techniques de l'API (Swagger) gardent le nom interne.
