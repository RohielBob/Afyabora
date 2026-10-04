# Feature `dashboard` — Tableau de bord

**Lot L2 · Fonctionnalité F3**

Dernière mesure, graphique, statistiques, qualité des données, comparaison de période.

## Tickets
- **L2-05** — Mobile : tableau de bord — dernière mesure et badge d'état (forme + libellé + couleur)
- **L2-06** — Mobile : graphique d'évolution 7/14/30/90 jours avec bande cible
- **L2-07** — Mobile : statistiques et comparaison avec la période précédente
- **L2-08** — Mobile : score de qualité des données et phrase d'explication
- **L8-11** — Tableau de bord et analyse calculés depuis la base locale (moteur sur le téléphone)

## Fichiers prévus
- `LatestReading.tsx`
- `GlucoseChart.tsx` (react-native-svg)
- `StatsCards.tsx`
- `QualityCard.tsx`
- `useLocalAnalysis.ts` : lit SQLite → GlucosePoint[] → @glyka/analytics

## Règle importante
Tout est calculé depuis la base LOCALE : le tableau de bord fonctionne hors-ligne.

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
