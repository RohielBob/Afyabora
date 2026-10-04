# Module `measurements`

**Lot : L2 · Fonctionnalité : F2 · Tickets : L2-01, L2-12**

Création, lecture, modification et suppression des mesures de glycémie.

## Routes
- GET /measurements?from&to · POST /measurements · PUT /measurements/:id · DELETE /measurements/:id

## Règles de gestion
- L'identifiant (UUID) vient du client : un même POST rejoué ne crée pas de doublon (idempotence).
- Conversion en mg/dL entier via `toMgDl`, valeur d'origine et unité conservées.
- Hors bornes plausibles : refus sauf `confirmedUnusual: true`.
- Date future refusée. Note personnelle chiffrée (AES-256-GCM).
- Suppression = tombstone (`deletedAt`) pour que la synchronisation la propage.
- Modification : `editedAt` renseigné.

## Tests obligatoires
- [ ] 1,48 g/L stocké 148 mg/dL.
- [ ] 18,7 g/L refusé sans confirmation.
- [ ] POST rejoué = une seule mesure.
- [ ] Suppression visible dans `/sync/pull`.

## Fichiers
| Fichier | Rôle |
|---|---|
| `measurements.module.ts` | Déclaration du module NestJS |
| `measurements.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `measurements.service.ts` | Logique métier et accès base (Prisma) |

## Rappels
- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
