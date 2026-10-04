# Module `events`

**Lot : L2 · Fonctionnalité : F4 · Tickets : L2-02, L2-10**

Événements de vie : repas, activité, traitement déclaré.

## Routes
- GET /events?from&to · POST /events · PUT /events/:id · DELETE /events/:id

## Règles de gestion
- Traitement = « déclaré par le patient » : aucun calcul de dose, aucun conseil.
- UUID fourni par le client (idempotence), suppression par tombstone.

## Tests obligatoires
- [ ] Événement rejoué = un seul enregistrement.

## Fichiers
| Fichier | Rôle |
|---|---|
| `events.module.ts` | Déclaration du module NestJS |
| `events.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `events.service.ts` | Logique métier et accès base (Prisma) |

## Rappels
- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
