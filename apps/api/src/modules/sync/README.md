# Module `sync`

**Lot : L8 · Fonctionnalité : F11 · Tickets : L8-04, L8-05, L8-09**

Synchronisation hors-ligne : reçoit les opérations empilées sur le téléphone, renvoie les changements serveur.

## Routes
- POST /sync/push : lot d'opérations (≤ 200) avec résultat par opération
- GET /sync/pull?cursor&limit : changements depuis le curseur (inclut les tombstones)

## Règles de gestion
- Chaque opération a un `opId` : déjà traité = `DUPLICATE` (table `SyncOpLog`), jamais appliqué deux fois.
- Conflit : la dernière écriture gagne selon `clientUpdatedAt`; sinon `CONFLICT_SERVER_WINS`.
- Curseur = (`updatedAt`, `id`) ; pagination stable, pas de perte d'élément.
- Une opération invalide est `REJECTED` avec raison, sans bloquer les autres.
- `measuredAt` plus de 5 min dans le futur : rejet (dérive d'horloge de l'appareil).
- Réutilise les services `measurements` et `events` (une seule logique métier).

## Tests obligatoires
- [ ] Même lot envoyé deux fois : aucun doublon.
- [ ] Suppression hors-ligne propagée.
- [ ] Conflit : dernière écriture gagne.
- [ ] Pull paginé : aucun élément perdu ni répété.
- [ ] Opération invalide n'empêche pas les autres.

## Fichiers
| Fichier | Rôle |
|---|---|
| `sync.module.ts` | Déclaration du module NestJS |
| `sync.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `sync.service.ts` | Logique métier et accès base (Prisma) |

## Rappels
- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
