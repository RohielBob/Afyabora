---
description: Lancer les contrôles de la CI en local et résumer le résultat
---

Lance les contrôles de la CI sur l'état actuel du dépôt, dans cet ordre, et arrête-toi au premier échec :

1. `pnpm format` puis `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build` seulement si je te le demande ou avant une PR.

Si le schéma Prisma a changé depuis le dernier passage, lance d'abord `pnpm --filter @glyka/api prisma:generate`.
Résume en français : ce qui passe, ce qui échoue (message exact, fichier, ligne), la cause probable et la correction proposée. Corrige les erreurs simples (formatage, imports inutilisés) toi-même ; pour le reste, explique et demande-moi. Ne dis « tout est vert » que si tu as vu les résultats.
