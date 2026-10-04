# ADR-0001 — Monorepo pnpm + Turborepo

- **Statut :** Proposé (à accepter en réunion, ticket L0-09)
- **Date :** 2026-10-04

## Contexte
Trois applications (mobile, portail, API) partagent des règles métier : unités, seuils, schémas de validation, moteur d'analyse. Équipe de plusieurs personnes, 10 jours.

## Décision
Un seul dépôt Git avec des espaces de travail **pnpm** (`apps/*`, `packages/*`, `scripts`) orchestrés par **Turborepo**. Le code commun vit dans `@glyka/shared`, `@glyka/analytics`, `@glyka/ui-tokens`.

## Alternatives étudiées
| Option | Avantages | Inconvénients |
|---|---|---|
| Un dépôt par application | Séparation nette | Contrats dupliqués, synchronisation manuelle des types |
| Monorepo npm/yarn | Outils connus | Moins rapide, installation plus lourde |

## Conséquences
- Un changement de schéma partagé est vu **immédiatement** par les trois applications (et casse la CI si incompatible).
- Expo exige `node-linker=hoisted` pour pnpm (`.npmrc`).
- Une seule CI : `format`, `lint`, `typecheck`, `test`, `build`.
