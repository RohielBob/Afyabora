# Feature `events` — Repas, activité, traitements déclarés

**Lot L2 · Fonctionnalité F4**

Ajout rapide d'événements de vie.

## Tickets
- **L2-10** — Mobile : ajout rapide d'un repas, d'une activité, d'un traitement déclaré

## Fichiers prévus
- `EventForm.tsx`
- `events.repo.ts` (à créer dans src/db/repositories)

## Règle importante
Traitement = déclaré par le patient, jamais de calcul de dose.

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
