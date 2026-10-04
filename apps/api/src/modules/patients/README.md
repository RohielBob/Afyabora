# Module `patients`

**Lot : L1 · Fonctionnalité : F1 · Tickets : L1-05, L1-14**

Profil médical du patient, seuils d'alerte, export et suppression de compte.

## Routes
- GET /me/profile · PUT /me/profile
- GET /me/export : export JSON/CSV de ses données (P1)
- DELETE /me : suppression du compte et des données (P1)

## Règles de gestion
- Seuils validés par `thresholdsSchema` (très bas < plage < très haut).
- Changer l'unité préférée ne modifie jamais les données stockées (mg/dL).
- Un patient n'accède qu'à son propre profil (contrôle de propriété).

## Tests obligatoires
- [ ] Seuils incohérents refusés.
- [ ] Un patient ne peut pas lire le profil d'un autre.

## Fichiers
| Fichier | Rôle |
|---|---|
| `patients.module.ts` | Déclaration du module NestJS |
| `patients.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `patients.service.ts` | Logique métier et accès base (Prisma) |

## Rappels
- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
