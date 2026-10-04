# Feature `insights` — Analyse et IA

**Lot L3 · Fonctionnalité F6**

Observations, « Voir les mesures concernées », résumé, question libre.

## Tickets
- **L3-04** — Mobile : écran Analyse avec « Voir les mesures concernées »
- **L3-08** — Question libre sur l'historique (IA-4)
- **L3-09** — Mobile : analyse et gabarits calculés hors-ligne depuis la base locale

## Fichiers prévus
- `InsightCard.tsx`
- `EvidenceList.tsx`
- `useInsights.ts` : local (analytics + gabarits) puis enrichissement serveur si en ligne
- `AskForm.tsx` (P1)

## Règle importante
Formulations descriptives, jamais de diagnostic ni de dose.

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
