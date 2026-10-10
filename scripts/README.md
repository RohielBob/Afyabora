# scripts/

Outils pour l'équipe : données de démo, administration, GitHub.

| Dossier        | Contenu                                                                                                                                                                                         | Ticket |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `seed-demo/`   | Génère 3 patients **fictifs** (Jean 96 % Bonne, Marie 60 % Partielle, Paul 34 % Insuffisante) + un médecin approuvé. Le générateur est **déterministe** (même graine = mêmes données) et testé. | L7-07  |
| `admin/`       | Comptes médecins : lister, voir, approuver, refuser (remplace une interface d'admin). Détails ci-dessous.                                                                                       | L1-12  |
| `sample-data/` | Fichiers d'import de test : `import-demo-147.csv` (**139 valides / 5 doublons / 3 incohérentes**, valeur 18,7 g/L à la ligne 42), `import-windows1252.csv`, `import-corrupted.xlsx`             | L4-08  |
| `github/`      | `create-labels.sh`, `create-issues.sh` (crée les 105 issues depuis `docs/team/backlog.csv`)                                                                                                     | L0-01  |

```bash
pnpm db:seed                                           # données de démo (DEMO_PASSWORD dans apps/api/.env)
pnpm admin:doctors                                     # comptes médecins en attente
pnpm --filter @glyka/scripts generate:sample-import    # régénère les fichiers d'import de test
pnpm --filter @glyka/scripts test                      # tests du générateur
```

Les tests du générateur ont été exécutés et passent. `admin/` a été vérifié contre la base de développement (L1-12) ; `seed-demo/index.ts` reste à **valider contre la vraie base** (L7-07).

## Comptes médecins (`admin/`, L1-12)

Un compte médecin créé sur le portail reste **en attente** : aucun dossier patient n'est accessible tant
qu'une personne de l'équipe ne l'a pas approuvé, après avoir vérifié le numéro d'ordre et l'établissement.

```powershell
pnpm admin:doctors                                   # comptes en attente (les plus anciens d'abord)
pnpm admin:doctors list --all                        # tous les comptes ; ou --status=APPROVED / REJECTED
pnpm admin:doctors show dr.nom@exemple.org           # fiche d'un compte
pnpm admin:doctors approve dr.nom@exemple.org        # affiche la fiche, explique, demande « o/N »
pnpm admin:doctors reject dr.nom@exemple.org         # idem
pnpm admin:doctors help
```

Règles :

- **Confirmation** avant toute modification (« o » ou « oui »). `--yes` la saute ; elle est **obligatoire**
  hors d'un terminal interactif (script, CI) : sans elle, rien n'est modifié.
- **Approbation impossible si l'adresse email n'est pas confirmée** (on ne sait pas qui lit la boîte).
- **Refuser un compte approuvé = suspension immédiate** : statut REFUSÉ, **sessions de connexion révoquées**
  et **partages patient en cours arrêtés**, en une seule transaction. Le nombre de sessions et de partages
  fermés est affiché.
- Réexamen possible (refusé → approuvé). Refaire la même action ne change rien.
- Le médecin **n'est pas prévenu par email** (pas d'envoi d'email depuis les scripts) : le prévenir ; il
  doit se reconnecter au portail pour que le nouveau statut s'applique.
- Codes de sortie : 0 = fait ou rien à faire, 1 = refusé ou erreur, 2 = commande mal écrite.
- L'ancienne commande `pnpm --filter @glyka/scripts admin:approve-doctor -- <email> [--reject]` marche
  toujours (elle appelle le même outil).

⚠️ Limite à traiter dans le lot L5 : un jeton d'accès déjà émis reste valable 15 minutes au plus. Les
routes médecin (`/shares/claim`, `/doctor/sessions/*`) doivent **revérifier le statut APPROUVÉ en base à
chaque requête** (déjà prévu par le README du module `auth` : un médecin non approuvé ne peut pas scanner).

| Fichier                   | Rôle                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `admin/doctors.ts`        | Logique sans base : arguments, règles, affichage                      |
| `admin/doctor-store.ts`   | Lecture et modifications en base (Prisma), refus en une transaction   |
| `admin/doctors-cli.ts`    | Outil en ligne de commande (fiche, explication, confirmation)         |
| `admin/approve-doctor.ts` | Ancienne commande, redirigée vers le nouvel outil                     |
| `admin/doctors.test.ts`   | Tests avec un faux stockage et un faux terminal (aucune base requise) |
