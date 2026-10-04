# Feature `imports` — Import CSV / Excel

**Lot L4 · Fonctionnalité F5**

Choix du fichier, correspondance des colonnes, rapport, décisions ligne par ligne.

## Tickets
- **L4-05** — Mobile : choix du fichier et de l'unité par défaut
- **L4-06** — Mobile : correspondance des colonnes
- **L4-07** — Mobile : rapport d'import et actions Corriger / Ignorer / Accepter

## Fichiers prévus
- `api.ts` : /imports/preview, /commit, annulation
- `FilePicker.tsx`
- `ColumnMapping.tsx`
- `ImportReportView.tsx`

## Règle importante
L'import nécessite le réseau (analyse côté serveur) : message clair hors-ligne.

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
