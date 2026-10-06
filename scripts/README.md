# scripts/

Outils pour l'équipe : données de démo, administration, GitHub.

| Dossier                   | Contenu                                                                                                                                                                                         | Ticket |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `seed-demo/`              | Génère 3 patients **fictifs** (Jean 96 % Bonne, Marie 60 % Partielle, Paul 34 % Insuffisante) + un médecin approuvé. Le générateur est **déterministe** (même graine = mêmes données) et testé. | L7-07  |
| `admin/approve-doctor.ts` | Approuve ou rejette un compte médecin (remplace une interface d'admin)                                                                                                                          | L1-12  |
| `sample-data/`            | Fichiers d'import de test : `import-demo-147.csv` (**139 valides / 5 doublons / 3 incohérentes**, valeur 18,7 g/L à la ligne 42), `import-windows1252.csv`, `import-corrupted.xlsx`             | L4-08  |
| `github/`                 | `create-labels.sh`, `create-issues.sh` (crée les 105 issues depuis `docs/team/backlog.csv`)                                                                                                     | L0-01  |

```bash
pnpm db:seed                                           # données de démo (DEMO_PASSWORD dans apps/api/.env)
pnpm --filter @glyka/scripts admin:approve-doctor -- medecin@exemple.com
pnpm --filter @glyka/scripts generate:sample-import    # régénère les fichiers d'import de test
pnpm --filter @glyka/scripts test                      # tests du générateur
```

Les tests du générateur ont été exécutés et passent. Les scripts qui touchent la base (`seed-demo/index.ts`, `admin/`) sont à **valider contre la vraie base** (L7-07, L1-12).
