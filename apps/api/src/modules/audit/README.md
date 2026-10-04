# Module `audit`

**Lot : L5 · Fonctionnalité : F7 · Tickets : L5-05**

Journal d'accès : trace qui a consulté quoi et quand. Service interne utilisé par `sharing`, `doctor`, `emergency`, `reports`.

## Routes
- (service interne, pas de route publique ; le patient lit son journal via GET /shares/log)

## Règles de gestion
- Une ligne par évènement : acteur, patient, session, action, IP, date.
- Jamais de contenu médical dans le journal. Le journal n'est ni modifiable ni supprimable par l'utilisateur.

## Tests obligatoires
- [ ] Chaque claim, consultation et révocation produit une ligne.

## Fichiers
| Fichier | Rôle |
|---|---|
| `audit.module.ts` | Déclaration du module NestJS |
| `audit.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `audit.service.ts` | Logique métier et accès base (Prisma) |

## Rappels
- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
