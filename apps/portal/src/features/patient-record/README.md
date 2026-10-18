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

## Composant déjà prêt

- `components/ui/ProvenanceBadge.tsx` (L4-09) : badge de provenance de chaque mesure (« Saisie », « Import ·
  lot 3F2A1C », « Appareil »), même règle que l'application du patient (`provenanceOf`, `@glyka/shared`),
  icône + texte, clair et sombre. À afficher dans la chronologie et le tableau des mesures.
- Le contrat donne `source` et `importBatchId` pour `GET /doctor/sessions/{id}/measurements` ; les éléments
  de `GET /doctor/sessions/{id}/timeline` (`TimelineItem`) n'ont que `source` (pas encore le lot).

## Règle importante

Lecture seule. Un onglet dont la catégorie n'est pas autorisée n'est pas affiché. Aucune donnée en cache après expiration.
