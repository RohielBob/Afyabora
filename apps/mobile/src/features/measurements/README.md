# Feature `measurements` — Saisie et gestion des mesures

**Lot L2 · Fonctionnalité F2**

Saisie rapide, confirmation de valeur inhabituelle, message de sécurité, édition, suppression.

## Tickets
- **L2-03** — Mobile : saisie rapide d'une mesure (valeur, unité, date, contexte), écriture locale d'abord
- **L2-04** — Mobile : confirmation de valeur inhabituelle + message de sécurité hypo/hyper
- **L2-11** — Mobile : modification et suppression d'une mesure
- **L4-09** — Badge de provenance (saisie, import, appareil) sur mesure, chronologie et portail

## Fichiers prévus
- `MeasurementForm.tsx`
- `useCreateMeasurement.ts` (écrit en LOCAL puis outbox)
- `validation.ts` (schémas de @glyka/shared)

## Règle importante
On n'appelle JAMAIS l'API directement pour écrire une mesure : on écrit en local, la synchronisation s'en charge.

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
