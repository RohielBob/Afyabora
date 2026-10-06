# Feature `sync` — Synchronisation hors-ligne

**Lot L8 · Fonctionnalité F11**

Outbox, push, pull, connectivité, état affiché à l'utilisateur.

## Tickets

- **L8-06** — Moteur de synchronisation mobile : push par lots, pull, reprise avec délai croissant
- **L8-07** — Détection de connectivité et déclencheurs (retour réseau, ouverture, tirer pour rafraîchir)
- **L8-08** — Coalescence de l'outbox (fonction pure + tests)
- **L8-09** — Tests de conflits et d'idempotence : rejeu, doublon, suppression hors-ligne, dérive d'horloge
- **L8-10** — Interface : « n mesures en attente », état de synchronisation, erreurs
- **L8-17** — Test hors-ligne de bout en bout sur un vrai téléphone (mode avion)

## Fichiers prévus

- `coalesce.ts` ✓ (fait, testé)
- `engine.ts` (squelette documenté)
- `connectivity.ts` ✓
- `SyncStatusBanner.tsx` : « n mesures en attente »

## Règle importante

Voir ADR-0004 et l'algorithme commenté dans engine.ts.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
