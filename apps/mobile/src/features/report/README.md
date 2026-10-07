# Feature `report` — Rapport « Préparer ma consultation »

**Lot L6 · Fonctionnalité F9**

Choix de la période, génération et partage du PDF.

## Tickets

- **L6-03** — Mobile : écran « Préparer ma consultation » et partage du PDF

## Fichiers prévus

- `api.ts`
- `PeriodPicker.tsx`
- `useShareReport.ts` : expo-file-system + expo-sharing

## Règle importante

Chiffres identiques au tableau de bord.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
