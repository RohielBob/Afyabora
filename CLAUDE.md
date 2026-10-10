# Afyabora — mémoire du projet pour Claude Code

> Lis ce fichier en entier au début de chaque session. L'état exact du travail est dans `docs/team/etat-davancement.md`, les pièges déjà rencontrés dans `docs/team/pieges-connus.md`.

## 1. Le projet

**Afyabora** (nom affiché ; nom de code interne `glyka`, voir ADR-0007) est une carte numérique d'historique médical pour personnes diabétiques : saisie de glycémie **hors-ligne**, analyse traçable, partage au médecin par **QR dynamique**. Projet d'équipe (PBL 5, MEO), 10 jours, MVP. Dépôt GitHub : `RohielBob/Afyabora`.
**Afyabora est un outil d'aide au suivi : jamais de diagnostic, de dose ni de cause affirmée.**

## 2. L'utilisateur et la façon de travailler

- Étudiant dans une équipe ; il pilote le projet avec toi. Il connaît peu Git/CI : **explique simplement le « pourquoi »**, en français, sans jargon inutile.
- Il travaille sous **Windows, PowerShell**, projet sur le disque externe `E:\Users\DELL\code rohiel\glyka-repo`. Donne des commandes PowerShell exactes (attention aux guillemets : `$?` dans des guillemets doubles est interprété).
- Il veut du **code complet** : quand tu livres un fichier modifié, il est entier, sans « … » ni abréviation ; ne simplifie pas la structure d'un script existant ; **documente chaque correction** (ce qui était faux, pourquoi, ce qui change) au lieu de la résumer.
- Règle de l'équipe (`CONTRIBUTING.md`) : **chacun doit pouvoir expliquer chaque ligne qu'il pousse**. Commente en français ce qui n'est pas évident, et termine chaque tâche par une explication simple de ce qui a changé (elle sert à la section « Explication du code » de la PR).
- **Sois honnête** sur ce que tu as exécuté ou non (tests lancés, commande vérifiée, hypothèse). Ne déclare jamais « ça marche » sans l'avoir vu.

## 3. Pile technique (versions à respecter)

- Monorepo **pnpm 9.12** (via corepack) + **Turborepo**, **Node 20**, TypeScript 5.6 strict. `.npmrc` : `node-linker=hoisted` (exigé par Expo, ADR-0001).
- `apps/api` : NestJS + Prisma 5.22 + PostgreSQL 16, Vitest. `apps/mobile` : Expo SDK 54, React Native 0.81.5, expo-router, SQLite locale, Jest. `apps/portal` : React 19 + Vite 5 (médecin).
- `packages/shared` (schémas **Zod 3.25 en API v3**, unités, seuils, enums), `packages/analytics` (moteur d'analyse déterministe, tourne aussi sur le téléphone), `packages/ui-tokens` (palette, typographie).
- **React est épinglé à 19.1.0** (mobile et portail) et `@types/react ~19.1.0` : deux versions de React dans le monorepo cassent le typage (TS2786) et peuvent casser l'exécution.
- **Ne pas monter de version majeure** sans accord : ESLint 10, Prisma 8 (rc), pnpm 12, etc. Les messages « Update available » sont à ignorer.

## 4. Commandes (racine du dépôt)

| But                                                                                                                                                                                                                                           | Commande                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Installer                                                                                                                                                                                                                                     | `pnpm install`                                                                                                                             |
| Vérifs de la CI (dans cet ordre)                                                                                                                                                                                                              | `pnpm format` · `pnpm format:check` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`                                          |
| Base + boîte mail de dev                                                                                                                                                                                                                      | `pnpm db:up` (PostgreSQL :5432, Mailpit web :8025) · `pnpm db:down`                                                                        |
| Migration Prisma (dev)                                                                                                                                                                                                                        | `pnpm --filter @glyka/api exec prisma migrate dev --name <nom_snake_case>` (procédure : `apps/api/prisma/README.md`)                       |
| Client Prisma                                                                                                                                                                                                                                 | `pnpm --filter @glyka/api prisma:generate` (la CI le fait avant le typecheck ; à refaire après un changement de schéma ou un `git pull`)   |
| API en dev                                                                                                                                                                                                                                    | `pnpm dev:api` (http://localhost:3000, Swagger sur `/docs`)                                                                                |
| API dans Docker                                                                                                                                                                                                                               | `pnpm docker:api` (profil `full`) puis `curl.exe http://localhost:3000/health`                                                             |
| Mobile                                                                                                                                                                                                                                        | `pnpm --filter @glyka/mobile exec expo start --clear` (`w` = web). Après un changement de palette : `pnpm --filter @glyka/ui-tokens build` |
| Tests d'un seul paquet                                                                                                                                                                                                                        | `pnpm --filter @glyka/api test` (idem `shared`, `analytics`, `mobile`)                                                                     |
| Secrets : `apps/api/.env` (jamais commité). Générer avec `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"` (JWT) et `randomBytes(32)` (clé AES). L'API **refuse de démarrer** avec une valeur « change-me ». |

## 5. Git et pull requests (règles strictes)

- Branche depuis `develop` à jour : `feat/<lot>-<sujet>`, `fix/<sujet>`, `docs/<sujet>`. **Jamais de commit direct sur `develop` ou `main`.**
- Commits _conventional_ en français, sujet en **minuscules** : `feat(api): inscription avec vérification d'email (L1-01)`. Scopes autorisés : `api, mobile, portal, shared, analytics, ui-tokens, docs, infra, scripts, ci`.
- Husky exécute Prettier sur les fichiers indexés et commitlint sur le message. Lance `pnpm format` avant de committer.
- **`git add` avec des chemins précis, jamais `git add -A`** (le dossier contient des fichiers personnels non suivis : `regrouper.py`, `scripts/github/create-issues-local.sh` — ne pas y toucher ni les committer).
- PR vers `develop`, **fusion « squash »** par l'utilisateur sur GitHub une fois la CI verte. Un ticket = une branche = une PR. Les branches empilées nécessitent `git rebase --onto origin/develop <ancienne-base> <branche>` après un squash.
- **Demande toujours l'accord de l'utilisateur avant** : `git push --force*`, `git reset --hard`, `git clean`, suppression de branche, `docker compose down -v`, `prisma migrate reset`, ajout/montée de dépendance, changement du contrat d'API.
- Modèle de PR : `.github/PULL_REQUEST_TEMPLATE.md`. Dans « Explication du code », indique **honnêtement** que le code a été écrit avec Claude Code et relu/testé par l'utilisateur.

## 6. Règles du produit (cahier des charges `docs/cahier-des-charges/CDC_MVP_Glyka.md`)

- **Unité canonique : mg/dL entier** (ADR-0002) ; on garde aussi valeur et unité d'origine. Plausible : 20–600 mg/dL ; hors bornes ⇒ confirmation explicite. Seuils par défaut dans `@glyka/shared`.
- **Local-first** (ADR-0004) : écriture d'abord en SQLite + outbox dans la même transaction ; UUID générés sur l'appareil ; `POST /sync/push` (≤200 ops, idempotent par `opId`) et `GET /sync/pull` (curseur, tombstones). Une opération invalide est rejetée **sans bloquer les autres**.
- **Analyse déterministe** (ADR-0005) : chiffres et observations viennent de `@glyka/analytics` ; un LLM ne fait que reformuler, avec repli sur gabarits.
- **QR de partage** (ADR-0003) : jeton opaque ≥32 octets, seul le hash SHA-256 est stocké, rotation 60 s, usage unique, médecin connecté et approuvé, catégories filtrées côté serveur, expiration revérifiée à chaque requête, journal d'accès.
- **Sécurité** : chaque route vérifie le **rôle ET la propriété** de la donnée ; toute entrée est validée par un schéma Zod de `packages/shared` ; **aucun secret ni donnée de santé dans les logs** ; champs sensibles chiffrés (AES-256-GCM) ; checklist : `docs/security/checklist.md`.
- Dates : stockées et renvoyées en **UTC (suffixe Z)**.
- **Interface** : textes en français via i18n (pas de texte en dur), **un état n'est jamais exprimé par la couleur seule** (couleur + symbole + libellé), avertissement « outil d'aide, pas un avis médical ». Marque (ADR-0008) : **rouge et blanc = couleurs principales** (bouton principal rouge `#E4002B`), **un état glycémique n'est jamais rouge** (palette dédiée + symbole + libellé). Thèmes Clair (défaut) / Sombre / Automatique × accents Rubis, Framboise, Marine, Graphite. **Un écran n'utilise que les composants de `@/components/ui` et les jetons de `@/theme` (`useTheme()`)** : pas de couleur, police ni durée d'animation en dur. Animations : `react-native-reanimated`, jetons de `motion.ts`, réglage « réduire les animations » respecté. Voir `docs/design/systeme-de-design.md`.
- Nom : texte visible par l'utilisateur ⇒ « Afyabora ». Identifiants techniques (`@glyka/*`, base `glyka`, clés de stockage, `com.glyka.app`) ⇒ inchangés (ADR-0007). Ne renomme pas les paquets.

## 7. Où trouver quoi

- Cahier des charges : `docs/cahier-des-charges/CDC_MVP_Glyka.md` (fonctions F1–F12 ; API §10).
- Tickets : `docs/team/backlog.csv` (colonnes lot, priorité, taille, jour, dépendances) · plan jour par jour : `docs/team/plan-de-travail.md`.
- Décisions : `docs/adr/0001…0007`. Contrat d'API gelé : `docs/api/openapi.v0.json` (+ `docs/api/README.md`, `docs/api/REVUE-SCHEMAS.md`). Toute route ajoutée ou modifiée ⇒ mise à jour du contrat **et** PR signalée à l'équipe.
- Chaque module de l'API a un `README.md` avec **Routes, Règles, Tests obligatoires** : c'est la spécification d'un ticket. Même principe pour `apps/mobile/src/features/*` et le portail.
- Schéma de base : `apps/api/prisma/schema.prisma` (17 modèles ; migration `init` appliquée).

## 8. Déroulé d'un ticket

1. Lire la ligne du ticket dans `backlog.csv`, ses dépendances, le README du module et la section du CDC.
2. Proposer un court plan et **attendre l'accord**, puis créer la branche depuis `origin/develop`.
3. Écrire le code **et** les tests (cas nominal, cas d'erreur, autorisations). Cocher les « Tests obligatoires » du README.
4. Lancer les vérifs de la CI (§4). Ne pas committer tant que `format:check`, `lint`, `typecheck`, `test` ne sont pas verts.
5. Commits propres (§5), `git push -u origin <branche>`, donner le titre et la description de PR prêts à coller.
6. Mettre à jour `docs/team/etat-davancement.md` et expliquer simplement ce qui a changé.
   Définition de « terminé » : critères cochés · tests verts · lint + types verts · README du module à jour · relu par une personne · tient dans le scénario de démo (`docs/demo/scenario.md`).

## 9. Ce que tu ne fais pas

- Lire ou afficher le contenu de `.env` / des secrets ; committer un secret.
- Changer la palette, les ADR ou le contrat d'API sans en parler.
- Ajouter une dépendance sans expliquer pourquoi et sans accord (le lockfile doit être committé avec).
- Réécrire un fichier existant en abrégeant ou en reformatant pour le plaisir.
