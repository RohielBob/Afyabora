# Feature `events` — Repas, activité, traitements déclarés

**Lot L2 · Fonctionnalité F4**

Ajout rapide d'événements de vie.

## Tickets

- **L2-10** — Mobile : ajout rapide d'un repas, d'une activité, d'un traitement déclaré

## Accès local (L2-09)

`local-store.ts` : `localEvents.save` / `localEvents.list`, sur le dépôt `db/repositories/events.repo.ts`
(L8-03 : événement + opération d'outbox dans la même transaction). Version web (aperçu sans SQLite) :
`local-store.web.ts`, en mémoire, construite avec les mêmes plans.

## Fichiers prévus

- `EventForm.tsx` (L2-10)

## Règle importante

Traitement = déclaré par le patient, jamais de calcul de dose.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
