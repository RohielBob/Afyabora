---
description: Préparer les commits, pousser la branche et rédiger la description de PR
argument-hint: <ID du ticket, ex. L1-01>
---

Prépare la livraison du ticket **$ARGUMENTS** :

1. Lance les contrôles (`/verifier` puis `pnpm build`). Ne continue que si tout est vert.
2. `git status` : liste les fichiers modifiés et dis-moi lesquels appartiennent au ticket. **Ne touche pas** à `regrouper.py` ni à `scripts/github/create-issues-local.sh`.
3. Crée des commits clairs en français, format conventionnel, sujet en minuscules, scope autorisé (`api, mobile, portal, shared, analytics, ui-tokens, docs, infra, scripts, ci`), avec `git add` sur des **chemins précis** (jamais `-A`).
4. `git push -u origin <branche>`. N'utilise aucune option `--force`.
5. Donne-moi, prêts à copier-coller : le **titre** de la PR (même format que les commits, avec l'ID du ticket) et la **description** selon `.github/PULL_REQUEST_TEMPLATE.md`. Dans « Explication du code », écris honnêtement que le code a été écrit avec Claude Code puis relu et testé par moi, et résume en 5 lignes simples ce qui a changé et pourquoi.
6. Donne-moi le lien `https://github.com/RohielBob/Afyabora/pull/new/<branche>` et rappelle-moi : base `develop`, attendre les Checks verts, puis « Squash and merge ». Tu ne fusionnes jamais toi-même.
