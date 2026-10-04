# Feature `patient-record` — Dossier patient

**Lot L5**

Onglets du dossier, graphiques, chronologie, résumé IA.

## Tickets
- **L5-12** — Portail : dossier patient (glycémie, chronologie, traitements, nutrition, activité, résumé IA)

## Fichiers prévus
- `tabs/GlucoseTab.tsx` (recharts)
- `tabs/TimelineTab.tsx`
- `tabs/TreatmentsTab.tsx`
- `tabs/NutritionTab.tsx`
- `tabs/ActivityTab.tsx`
- `tabs/SummaryTab.tsx`
- `tabs/ReportTab.tsx`

## Règle importante
Lecture seule. Un onglet dont la catégorie n'est pas autorisée n'est pas affiché. Aucune donnée en cache après expiration.
