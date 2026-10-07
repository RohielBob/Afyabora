# Feature `timeline` — Chronologie médicale

**Lot L2 · Fonctionnalité F4**

Liste groupée par jour, filtres, badges de provenance.

## Tickets

- **L2-09** — Mobile : chronologie (groupée par jour, filtres, badges de provenance)
- **L4-09** — Badge de provenance (saisie, import, appareil) sur mesure, chronologie et portail

## Fichiers prévus

- `TimelineList.tsx`
- `TimelineItem.tsx`
- `filters.ts`

## Règle importante

Icône + texte sur chaque ligne (pas la couleur seule).

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
