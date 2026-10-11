# Mise en place de GitHub (lead technique, ticket L0-01)

## 1. Dépôt et branches

1. Créer le dépôt (privé) et y pousser ce code. Remplacer `OWNER` dans `.github/ISSUE_TEMPLATE/config.yml` et les identifiants dans `.github/CODEOWNERS`.
2. Créer la branche `develop` à partir de `main`.
3. **Protéger `main` et `develop`** (Settings → Branches) :
   - exiger une pull request avant fusion, **1 relecture minimum** ;
   - exiger que la CI (`check`) soit verte ;
   - interdire les poussées directes ; fusion en _squash_.

## 2. Labels

```bash
scripts/github/create-labels.sh
```

## 3. Tableau de suivi (GitHub Projects)

Colonnes : `Backlog` → `Ready` → `En cours` → `En relecture` → `Terminé`. Champs : Lot, Priorité, Jour, Taille.
Créer 10 **jalons** `J1` … `J10` avec les dates réelles.

## 4. Issues du backlog

```bash
gh auth login
scripts/github/create-issues.sh --dry-run   # vérifier
scripts/github/create-issues.sh             # créer les 116 issues
```

Puis assigner les lots selon `plan-de-travail.md` et passer les tickets du jour en `Ready`.

## 5. Premier jour (ticket L0-02)

```bash
corepack enable && pnpm install
pnpm db:up
cp apps/api/.env.example apps/api/.env      # générer les secrets
pnpm --filter @glyka/api prisma:migrate
pnpm test                                    # tests de shared, analytics, api (crypto), mobile (coalesce)
```

> Ce dépôt a été préparé **sans accès au réseau** : `pnpm install` n'a jamais été exécuté ici. Les versions de dépendances (notamment Expo) sont à aligner au premier jour ; corriger ce qui casse et le noter dans la PR de L0-02.
