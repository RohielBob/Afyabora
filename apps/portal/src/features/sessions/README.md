# Feature `sessions` — Patients partagés

**Lot L5**

Liste des sessions de partage (actives et expirées), compte à rebours.

## Tickets

- **L5-11** — Portail : liste des patients partagés (statut, dernière donnée, qualité)
- **L5-13** — Portail : bandeau de compte à rebours et écran « Accès expiré »

## Fichiers prévus

- `SessionList.tsx`
- `SessionStatusBadge.tsx`
- `useCountdown.ts` : fondé sur l'heure du SERVEUR

## Règle importante

Le minuteur est indicatif : l'expiration réelle est contrôlée côté serveur à chaque requête.
