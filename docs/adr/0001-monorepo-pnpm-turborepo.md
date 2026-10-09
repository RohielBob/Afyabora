# ADR-0001 — Monorepo pnpm + Turborepo

- **Statut :** Accepté avec une précision — réunion du 2026-10-09 (ticket L0-09)
- **Date :** 2026-10-04

## Contexte

Trois applications (mobile, portail, API) partagent des règles métier : unités, seuils, schémas de validation, moteur d'analyse. Équipe de plusieurs personnes, 10 jours.

## Décision

Un seul dépôt Git avec des espaces de travail **pnpm** (`apps/*`, `packages/*`, `scripts`) orchestrés par **Turborepo**. Le code commun vit dans `@glyka/shared`, `@glyka/analytics`, `@glyka/ui-tokens`.

## Alternatives étudiées

| Option                   | Avantages        | Inconvénients                                          |
| ------------------------ | ---------------- | ------------------------------------------------------ |
| Un dépôt par application | Séparation nette | Contrats dupliqués, synchronisation manuelle des types |
| Monorepo npm/yarn        | Outils connus    | Moins rapide, installation plus lourde                 |

## Conséquences

- Un changement de schéma partagé est vu **immédiatement** par les trois applications (et casse la CI si incompatible).
- Expo exige `node-linker=hoisted` pour pnpm (`.npmrc`).
- Une seule CI : `format`, `lint`, `typecheck`, `test`, `build`.

## Précision ajoutée à l'acceptation (réunion du 2026-10-09)

- React est épinglé à **19.1.0** dans le mobile et le portail. **Exception assumée :** l'API utilise React 18.3.1, uniquement pour générer les PDF côté serveur (`@react-pdf/renderer`). pnpm l'installe à part, dans `apps/api/node_modules`, donc il ne se mélange pas avec React 19.
- Monter `@react-pdf/renderer` pour supprimer cette exception est une **montée de dépendance** : elle se décide en équipe, pas en passant.
