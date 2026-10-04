# @glyka/shared

**Le contrat commun** entre l'API, le mobile et le portail : énumérations, schémas **Zod**, conversions d'unités, seuils, constantes.

> Règle d'or : une règle métier ou un format de données se définit **ici, une seule fois**. Aucun copier-coller dans une app.

## Contenu
| Fichier | Rôle |
|---|---|
| `src/enums.ts` | Types de diabète, unités, contextes, catégories de partage, catégories de notification… |
| `src/units.ts` | `toMgDl`, `fromMgDl`, `formatGlucose`, `isPlausible`, `parseDecimal` (ADR-0002) |
| `src/thresholds.ts` | Seuils par défaut (à valider par un clinicien), `classifyGlucose`, symboles d'état |
| `src/constants.ts` | TTL des jetons QR, durées de partage, limites d'import, règles de mot de passe |
| `src/schemas/*.ts` | Schémas Zod de chaque domaine : auth, profil, mesure, événement, import, partage, urgence, notifications, **sync** |

## Utilisation
```ts
import { createMeasurementSchema, toMgDl } from '@glyka/shared';
```

## Règles de contribution
- Toute modification d'un schéma = **changement de contrat** : prévenir l'équipe, mettre à jour l'OpenAPI.
- Tests obligatoires pour `units.ts` et `thresholds.ts` (déjà en place dans `test/`).
- Pas de dépendance autre que `zod`.

## Commandes
`pnpm --filter @glyka/shared test` · `build` · `typecheck`

**Lot : L0 (Socle) — propriétaire : lead technique.**
