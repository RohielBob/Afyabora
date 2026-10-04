# Feature `auth` — Authentification médecin

**Lot L1**

Inscription, connexion, session, statut du compte (en attente / approuvé).

## Tickets
- **L1-11** — Portail : inscription et connexion médecin, page « compte en attente »

## Fichiers prévus
- `api.ts`
- `useSession.ts`
- `RequireApproved.tsx` : garde de route

## Règle importante
Un compte « en attente » n'accède à aucun dossier.
