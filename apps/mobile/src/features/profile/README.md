# Feature `profile` — Profil médical et paramètres de santé

**Lot L1 · Fonctionnalité F1**

Assistant de profil, unité préférée, plage cible et seuils.

## Tickets
- **L1-05** — API : profil patient et seuils d'alerte (validation Zod)
- **L1-08** — Mobile : assistant de profil en 3 étapes

## Fichiers prévus
- `api.ts`
- `useProfile.ts`

## Règle importante
Les seuils affichent « à définir avec votre médecin ».

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
