---
description: Clôturer un ticket fusionné (README du module, état d'avancement, nettoyage)
argument-hint: <ID du ticket, ex. L1-01>
---

La PR du ticket **$ARGUMENTS** est fusionnée. Termine proprement :

1. `git fetch`, `git checkout develop`, `git pull`, puis vérifie avec `git log --oneline -5` que la fusion y est.
2. Sur une petite branche `docs/etat-<ID>` : coche les « Tests obligatoires » faits dans le `README.md` du module et mets à jour `docs/team/etat-davancement.md` (tableau, « Prochaines étapes », nouvelles décisions ou pièges dans `docs/team/pieges-connus.md` si on en a appris).
3. Dis-moi quelles branches locales on peut supprimer (`git branch -d`, sans `-D` sans mon accord).
4. Propose le prochain ticket d'après `docs/team/backlog.csv` et le chemin critique de `docs/team/plan-de-travail.md`, avec ses dépendances, mais n'y commence pas sans mon accord.
