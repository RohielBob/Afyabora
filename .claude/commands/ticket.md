---
description: Démarrer un ticket du backlog (lecture, plan, branche) sans coder avant accord
argument-hint: <ID du ticket, ex. L1-01>
---

Je veux démarrer le ticket **$ARGUMENTS**.

1. Lis `CLAUDE.md`, puis la ligne de `$ARGUMENTS` dans `docs/team/backlog.csv` (titre, priorité, taille, jour, dépendances), la section correspondante du cahier des charges, le `README.md` du module concerné (Routes, Règles, Tests obligatoires) et le contrat `docs/api/openapi.v0.json` si une route est concernée.
2. Vérifie l'état réel : `git status`, `git fetch`, `git log origin/develop --oneline -10`. Dis-moi si une dépendance du ticket n'est pas fusionnée dans `develop`.
3. Relis la section « À confirmer contre le contrat » de `docs/team/etat-davancement.md` : signale ce qui touche ce ticket.
4. Présente-moi, en français simple et en 15 lignes maximum : ce que le ticket doit produire, les fichiers que tu comptes créer ou modifier, les tests prévus, les risques et les points où tu as besoin de ma décision.
5. **N'écris aucun code et ne crée aucune branche avant mon accord.** Après accord : crée la branche `feat/<lot>-<sujet>` depuis `origin/develop` (`git fetch` d'abord) et commence.
