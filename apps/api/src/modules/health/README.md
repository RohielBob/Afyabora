# Module `health`

**Lot : L0 · Fonctionnalité : F— · Tickets : L0-04**

Vérification que l'API répond (utilisée par la CI, Docker et l'hébergeur).

## Routes

- GET /health : état de l'API et de la base de données (public)

## Règles de gestion

- Aucune donnée sensible dans la réponse.

## Tests obligatoires

- [ ] Retourne 200 avec la base joignable.

## Fichiers

| Fichier                | Rôle                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `health.module.ts`     | Déclaration du module NestJS                                                                           |
| `health.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `health.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
