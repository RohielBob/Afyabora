# Feature `sharing` — Partage par QR dynamique

**Lot L5 · Fonctionnalité F7**

Choix catégories/durée, QR rotatif, suivi en direct, révocation, journal d'accès.

## Tickets
- **L5-06** — Mobile : choix des catégories à partager et de la durée
- **L5-07** — Mobile : écran QR avec compte à rebours de rotation
- **L5-08** — Mobile : suivi en direct (« Dr X consulte », minuteur, bouton Mettre fin)
- **L5-09** — Mobile : écran « Qui a consulté mes données »

## Fichiers prévus
- `api.ts`
- `CategoryPicker.tsx`
- `DurationPicker.tsx`
- `RotatingQr.tsx` : renouvelle le jeton toutes les 60 s
- `useShareStatus.ts` : suivi (polling/SSE)

## Règle importante
Nécessite le réseau. Le QR ne contient jamais de donnée médicale, seulement un jeton opaque.

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
