# Module `imports`

**Lot : L4 · Fonctionnalité : F5 · Tickets : L4-01 à L4-04, L4-08**

Import CSV / Excel avec validation et rapport.

## Routes
- POST /imports/preview : analyse le fichier, crée un lot `PREVIEW`, renvoie le rapport
- POST /imports/:id/commit : applique les décisions (Corriger / Ignorer / Accepter)
- DELETE /imports/:id : annule un lot déjà importé

## Règles de gestion
- Limites : 5 Mo, 5 000 lignes (`IMPORT_MAX_*`).
- CSV : séparateurs `;` `,` tabulation ; virgule ou point décimal ; encodages UTF-8 et Windows-1252.
- Dates `jj/mm/aaaa`, `aaaa-mm-jj`, avec ou sans heure.
- Statuts : VALID, DUPLICATE (dans la base ET dans le fichier), INCONSISTENT (hors bornes pour l'unité), ERROR (illisible, date future).
- RIEN n'est écrit dans `Measurement` avant `commit`.
- Mesures importées : `source = IMPORT`, `importBatchId` renseigné ; annulation = tombstones de tout le lot.

## Tests obligatoires
- [ ] `scripts/sample-data/import-demo-147.csv` : 139 valides, 5 doublons, 3 incohérentes.
- [ ] `.xlsx` corrompu : erreur claire, pas de plantage.
- [ ] Annuler un lot supprime toutes ses mesures.
- [ ] Ligne 42 (18,7 g/L) signalée « vérifier l'unité ».

## Fichiers
| Fichier | Rôle |
|---|---|
| `imports.module.ts` | Déclaration du module NestJS |
| `imports.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `imports.service.ts` | Logique métier et accès base (Prisma) |

## Rappels
- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
