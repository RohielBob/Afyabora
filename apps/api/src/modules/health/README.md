# Module `health`

**Lot : L0 · Fonctionnalité : F— · Tickets : L0-04**

Vérification que l'API répond (utilisée par la CI, Docker et l'hébergeur).

## Routes

- GET /health : état de l'API et de la base de données (public)
  - **200** `{ "status": "ok", "time": "<date ISO>" }` : l'API répond et la base est joignable.
  - **503** `{ "status": "error", "message": "Service indisponible" }` : la base est injoignable.

## Règles de gestion

- Aucune donnée sensible dans la réponse : seulement `status` et `time`.
- En cas d'erreur, aucun détail interne (message d'erreur, adresse de la base) n'est renvoyé ni journalisé : seul le type d'erreur est écrit dans les logs.

## Tests obligatoires

- [x] Retourne 200 avec la base joignable (sans jeton, malgré la garde globale).
- [x] Ne renvoie que `status` et `time`.
- [x] Retourne 503 sans détail interne quand la base est injoignable.

Les tests utilisent un faux accès base de données : ils n'ont pas besoin de Docker.

## Fichiers

| Fichier                        | Rôle                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `health.module.ts`             | Déclaration du module NestJS                                   |
| `health.controller.ts`         | Route HTTP publique, pas de logique métier                     |
| `health.service.ts`            | Interroge la base (`SELECT 1`) et choisit 200 ou 503           |
| `../../../test/health.test.ts` | Tests de la route avec la même garde globale que l'application |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée (cette route publique n'en a pas besoin : elle ne renvoie aucune donnée).
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
