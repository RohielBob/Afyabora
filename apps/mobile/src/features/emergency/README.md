# Feature `emergency` — Carte d'urgence

**Lot L6 · Fonctionnalité F10**

Éditeur, QR urgence, activation, régénération, export image.

## Tickets

- **L6-06** — Mobile : éditeur de carte d'urgence, QR urgence, export image

## Fichiers prévus

- `api.ts`
- `EmergencyForm.tsx`
- `EmergencyQr.tsx`

## Règle importante

Uniquement les champs choisis par le patient ; jamais d'historique.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
