# Feature `insights` — Analyse et IA

**Lot L3 · Fonctionnalité F6**

Observations, « Voir les mesures concernées », résumé, question libre.

## Tickets

- **L8-11** — Analyse calculée sur le téléphone depuis la base locale — **fait** (données, sans écran)
- **L3-04** — Mobile : écran Analyse avec « Voir les mesures concernées »
- **L3-08** — Question libre sur l'historique (IA-4)
- **L3-09** — Mobile : analyse et gabarits calculés hors-ligne depuis la base locale

## Analyse calculée sur le téléphone (L8-11)

- `loadLocalAnalysis(days, now)` lit les mesures **dans la base locale** (SQLite ; magasin en mémoire en
  aperçu web) puis appelle `analyzeLastDays` de `@glyka/analytics` : **la même fonction que l'API**
  (`GET /insights`). Hors-ligne ou en ligne, le patient voit les mêmes chiffres, observations et phrases.
- Période : les N derniers jours **entiers** (minuit à minuit, heure du téléphone, heure d'été comprise) ;
  lecture de la période **et** de la période précédente (comparaison) ; seuils du patient gardés sur le
  téléphone ; aucun appel réseau.
- `useLocalAnalysis(days)` : état `loading` / `error` / `ready`, relu à chaque retour sur l'écran et à chaque
  changement de période ; une lecture plus ancienne n'écrase jamais la plus récente.

| Fichier                            | Rôle                                              |
| ---------------------------------- | ------------------------------------------------- |
| `local-analysis.ts`                | Lecture locale + appel du moteur (sans interface) |
| `useLocalAnalysis.ts`              | Hook pour l'écran « Analyse »                     |
| `__tests__/local-analysis.test.ts` | Jeu de référence, fenêtre lue, seuils, hors-ligne |

## Tests obligatoires (L8-11)

- [x] Lecture de la période et de la période précédente, de minuit à minuit ; minuit ce soir exclu.
- [x] Jeu de référence de L3-01 placé à l'heure du téléphone : 70 / 20 / 10 %, qualité 86, cinq observations,
      leurs preuves et leurs phrases exactes — identique sous 7 fuseaux (Kinshasa, Paris, New York,
      Kiritimati, Katmandou, Santiago, UTC).
- [x] Seuils du patient, moins de 10 mesures, 30 jours ; aucun appel réseau ; base illisible ⇒ erreur.

## Fichiers prévus

- `InsightCard.tsx`
- `EvidenceList.tsx`
- `useInsights.ts` : local (analytics + gabarits) puis enrichissement serveur si en ligne
- `AskForm.tsx` (P1)

## Règle importante

Formulations descriptives, jamais de diagnostic ni de dose.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
