# Feature `notifications` — Notifications

**Lot L8 · Fonctionnalité F12**

Rappels de mesure et alertes LOCALES (hors-ligne), push serveur, préférences.

## Tickets

- **L8-12** — Notifications locales : rappels de mesure programmables
- **L8-13** — Notifications locales : alerte de seuil et « pas de mesure depuis X heures »
- **L8-15** — Écran de préférences : catégories, heures calmes, contenu sur écran verrouillé

## Fichiers prévus

- `scheduler.ts` : planifie les rappels (expo-notifications)
- `alerts.ts` : seuils franchis, « pas de mesure depuis X h »
- `registerDevice.ts` : jeton push → POST /devices
- `preferences.ts`

## Règle importante

Par défaut, AUCUNE valeur de santé dans le texte d'une notification (écran verrouillé).

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
