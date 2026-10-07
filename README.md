# Glyka — Suivez. Contrôlez. Comprenez.

Carte numérique d'historique médical pour personnes diabétiques : le patient enregistre sa glycémie (**même hors-ligne**), comprend son historique, et choisit **qui voit quoi, et pendant combien de temps** grâce à un **QR dynamique**. Projet 3 du PBL 5 (MEO o1.1).

> **Glyka est un outil d'aide au suivi.** Il ne pose pas de diagnostic, ne calcule pas de dose et ne remplace pas un professionnel de santé.

## Les trois piliers

| Suivre                                                                         | Contrôler                                                                          | Comprendre                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Saisie rapide, **hors-ligne**, import CSV/Excel, chronologie, score de qualité | QR rotatif à usage unique, consentement par catégorie, révocation, journal d'accès | Tendances, alertes, résumé, rapport PDF — une analyse **traçable** |

## Structure du dépôt

```
apps/
├─ mobile/      App patient (Expo, local-first : SQLite + synchronisation)
├─ portal/      Portail médecin (React + Vite)
└─ api/         API NestJS + PostgreSQL (Prisma)
packages/
├─ shared/      Contrat commun : schémas Zod, unités, seuils, enums
├─ analytics/   Moteur d'analyse déterministe (tourne aussi sur le téléphone)
└─ ui-tokens/   Identité visuelle (couleurs, typographie, espacements)
docs/           Cahier des charges, ADR, backlog, plan de travail, sécurité, démo
scripts/        Données de démo, administration, GitHub
infra/          Docker (le docker-compose.yml est à la racine)
.github/        Modèles d'issues et de PR, CI, CODEOWNERS, labels
```

## Démarrage rapide

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env     # puis générer les secrets (voir le fichier)
pnpm db:up                                  # PostgreSQL + Mailpit
pnpm db:migrate
pnpm dev:api        # http://localhost:3000  (Swagger : /docs)
pnpm dev:portal     # http://localhost:5173
pnpm dev:mobile     # Expo (development build requis pour push et chiffrement : voir apps/mobile/README.md)
pnpm test           # tous les tests
```

## Pour l'équipe

1. Lire `docs/cahier-des-charges/CDC_MVP_Glyka.md` et `CONTRIBUTING.md`.
2. Prendre un ticket de `docs/team/backlog.md` (lot, priorité, jour, dépendances).
3. Branche `feat/<lot>-<sujet>` → pull request vers `develop` → relecture → CI verte.
4. Chacun doit pouvoir **expliquer chaque ligne** qu'il pousse.

## État du dépôt

Socle, contrats partagés, moteur d'analyse (testé), schéma de base, helpers de sécurité (testés), base locale mobile + outbox, écrans provisoires, modèles GitHub et backlog sont **en place**. Les modules métier de l'API, les écrans, la synchronisation et le portail sont **à implémenter** selon le backlog.
