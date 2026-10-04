# Arborescence du dépôt Glyka — fichier par fichier

Version du dépôt : **v0.2** (hors-ligne + notifications) · **299 fichiers** · 105 tickets de backlog.
À distribuer à l'équipe avec `glyka-repo.zip`. Une copie est dans le dépôt : `docs/ARBORESCENCE_GLYKA.md`.

## Légende
| Marque | Signification |
|---|---|
| ✅ | Code ou contenu **réel** : en place (voir §4 pour ce qui a été exécuté) |
| 🟡 | **Squelette** à implémenter : contient un `TODO(ticket)` ou un écran/page provisoire |
| (vide) | Document ou configuration |

Chaque squelette cite le **ticket** à réaliser ; les tickets sont dans `docs/team/backlog.md`.

## 1. Chiffres
- 101 fichiers de code réels (✅) · 75 squelettes à implémenter (🟡) · le reste : documentation et configuration
- 7 paquets : `@glyka/api`, `@glyka/mobile`, `@glyka/portal`, `@glyka/shared`, `@glyka/analytics`, `@glyka/ui-tokens`, `@glyka/scripts`
- 14 modules d'API · 29 écrans mobiles · 7 pages de portail · 13 features mobiles · 6 ADR

## 2. Où travaille chaque lot
| Lot | Intitulé | Tickets | Dossiers principaux |
|---|---|---|---|
| **L0** | Socle | 11 | racine, `infra/`, `.github/`, `apps/api/prisma/`, `docs/api/` |
| **L1** | Auth & profil | 14 | `apps/api/src/modules/{auth,patients}`, `apps/mobile/app/(auth)`, `(onboarding)`, `features/{auth,profile}`, `apps/portal/src/features/auth` |
| **L2** | Mesures & tableau de bord | 12 | `modules/{measurements,events}`, `features/{measurements,events,dashboard,timeline}`, `app/(tabs)`, `app/measurement` |
| **L3** | Analyse | 10 | `packages/analytics`, `modules/insights`, `features/insights` |
| **L4** | Import | 9 | `modules/imports`, `features/imports`, `app/import`, `scripts/sample-data` |
| **L5** | Partage & portail médecin | 14 | `modules/{sharing,audit,doctor}`, `features/sharing`, `app/share`, **tout `apps/portal`** |
| **L6** | Rapport & urgence | 6 | `modules/{reports,emergency}`, `features/{report,emergency}`, `app/{report,emergency}` |
| **L7** | Design & contenu | 12 | `packages/ui-tokens`, `apps/mobile/src/components/ui`, `i18n`, `docs/design`, `docs/demo`, `scripts/seed-demo` |
| **L8** | Hors-ligne & notifications | 17 | `apps/mobile/src/{db,features/sync,features/notifications}`, `modules/{sync,notifications}`, `app/settings/notifications` |

## 3. L'arborescence
```
glyka/
├── .github/  — Automatisation et modèles GitHub
│   ├── ISSUE_TEMPLATE/  — Formulaires d'issues
│   │   ├── bug.yml  — Rapport de bug (sans donnée de santé réelle)
│   │   ├── config.yml  — Désactive les issues vides, lien vers les discussions
│   │   ├── feature.yml  — Proposition de fonctionnalité (score matrice de décision)
│   │   └── task.yml  — Ticket de développement (critères d'acceptation, taille, priorité)
│   ├── workflows/
│   │   └── ci.yml  — CI : format, lint, types, tests, build (PostgreSQL de test)
│   ├── CODEOWNERS  — Relecteurs obligatoires par dossier (remplacer les @pseudos)
│   ├── labels.yml  — 26 labels (type, priorité, lot, zone)
│   └── PULL_REQUEST_TEMPLATE.md  — Modèle de PR : checklist, tests, explication du code
├── .husky/  — Hooks Git
│   ├── commit-msg  — Vérifie le format du message de commit
│   └── pre-commit  — Formate les fichiers modifiés
├── apps/
│   ├── api/  — API NestJS + Prisma (lots L0–L8)
│   │   ├── prisma/  — Base de données
│   │   │   └── schema.prisma  — MODÈLE DE DONNÉES : 17 modèles (mesures, partage, sync, notifications…)
│   │   ├── src/
│   │   │   ├── common/
│   │   │   │   ├── crypto/
│   │   │   │   │   ├── field-encryption.ts  ✅  — Chiffrement AES-256-GCM des notes personnelles
│   │   │   │   │   └── tokens.ts  ✅  — Jetons opaques + hash SHA-256 (base du QR)
│   │   │   │   ├── decorators/
│   │   │   │   │   ├── current-user.decorator.ts  ✅  — @CurrentUser() : utilisateur authentifié
│   │   │   │   │   ├── public.decorator.ts  ✅  — @Public() : route sans jeton
│   │   │   │   │   └── roles.decorator.ts  ✅  — @Roles() : restriction par rôle
│   │   │   │   ├── filters/
│   │   │   │   │   └── all-exceptions.filter.ts  ✅  — Erreurs homogènes, sans détail interne
│   │   │   │   ├── guards/
│   │   │   │   │   ├── jwt-auth.guard.ts  ✅  — Guard global : jeton d'accès obligatoire
│   │   │   │   │   └── roles.guard.ts  ✅  — Guard des rôles
│   │   │   │   └── pipes/
│   │   │   │       └── zod-validation.pipe.ts  ✅  — Valide les entrées avec les schémas de @glyka/shared
│   │   │   ├── config/
│   │   │   │   └── env.ts  ✅  — Variables d'environnement validées (Zod) au démarrage
│   │   │   ├── modules/
│   │   │   │   ├── audit/  — Journal d'accès (L5)
│   │   │   │   │   ├── audit.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── audit.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── audit.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── auth/  — Comptes et sessions (L1)
│   │   │   │   │   ├── auth.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── auth.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── auth.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── doctor/  — Lecture des dossiers partagés (L5)
│   │   │   │   │   ├── doctor.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── doctor.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── doctor.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── emergency/  — Carte d'urgence (L6)
│   │   │   │   │   ├── emergency.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── emergency.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── emergency.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── events/  — Événements de vie (L2)
│   │   │   │   │   ├── events.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── events.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── events.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── health/  — Santé de l'API (L0)
│   │   │   │   │   ├── health.controller.ts  ✅  — Route HTTP
│   │   │   │   │   ├── health.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── health.service.ts  ✅  — Logique métier
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── imports/  — Import CSV/Excel (L4)
│   │   │   │   │   ├── imports.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── imports.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── imports.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── insights/  — Analyse et IA (L3)
│   │   │   │   │   ├── insights.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── insights.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── insights.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── measurements/  — Mesures (L2)
│   │   │   │   │   ├── measurements.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── measurements.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── measurements.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── notifications/  — Push serveur et préférences (L8)
│   │   │   │   │   ├── notifications.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── notifications.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── notifications.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── patients/  — Profil, export, suppression (L1)
│   │   │   │   │   ├── patients.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── patients.module.ts  ✅  — Module NestJS
│   │   │   │   │   ├── patients.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   │   └── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   ├── reports/  — Rapport PDF (L6)
│   │   │   │   │   ├── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   │   ├── reports.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── reports.module.ts  ✅  — Module NestJS
│   │   │   │   │   └── reports.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   ├── sharing/  — QR DYNAMIQUE : cœur du produit (L5)
│   │   │   │   │   ├── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │   │   ├── sharing.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │   │   ├── sharing.module.ts  ✅  — Module NestJS
│   │   │   │   │   └── sharing.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   │   └── sync/  — Synchronisation hors-ligne (L8)
│   │   │   │       ├── README.md  — Rôle, routes, règles de gestion, tests obligatoires
│   │   │   │       ├── sync.controller.ts  🟡  — Routes HTTP (à implémenter)
│   │   │   │       ├── sync.module.ts  ✅  — Module NestJS
│   │   │   │       └── sync.service.ts  🟡  — Logique métier (à implémenter)
│   │   │   ├── prisma/
│   │   │   │   ├── prisma.module.ts  ✅  — Module Prisma global
│   │   │   │   └── prisma.service.ts  ✅  — Connexion à la base
│   │   │   ├── scripts/
│   │   │   │   └── export-openapi.ts  ✅  — Exporte le contrat OpenAPI (L0-07)
│   │   │   ├── app.module.ts  ✅  — Assemble les 14 modules + guards globaux (débit → JWT → rôles)
│   │   │   └── main.ts  ✅  — Démarrage : Helmet, CORS, Swagger (/docs), filtre d'erreurs
│   │   ├── test/
│   │   │   └── crypto.test.ts  ✅  — Tests : chiffrement et jetons
│   │   ├── .env.example  — Variables de l'API (secrets à générer)
│   │   ├── nest-cli.json  — Config NestJS
│   │   ├── package.json  — Dépendances et scripts de l'API
│   │   ├── README.md  — Démarrage, structure, règles, état
│   │   ├── tsconfig.json  — TypeScript (décorateurs activés)
│   │   └── vitest.config.ts  ✅  — Tests (Vitest + SWC pour l'injection de dépendances)
│   ├── mobile/  — App patient Expo / React Native (local-first)
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── _layout.tsx  ✅  — Pile d'authentification
│   │   │   │   ├── forgot-password.tsx  🟡  — Écran : Mot de passe oublié — L1-06
│   │   │   │   ├── sign-in.tsx  🟡  — Écran : Se connecter — L1-06, L1-07
│   │   │   │   ├── sign-up.tsx  🟡  — Écran : Créer un compte — L1-06, L1-10
│   │   │   │   ├── verify-email.tsx  🟡  — Écran : Vérifier mon email — L1-06
│   │   │   │   └── welcome.tsx  🟡  — Écran : Bienvenue — L1-06
│   │   │   ├── (onboarding)/
│   │   │   │   ├── _layout.tsx  ✅  — Pile d'onboarding
│   │   │   │   └── profile-setup.tsx  🟡  — Écran : Mon profil médical — L1-08
│   │   │   ├── (tabs)/
│   │   │   │   ├── _layout.tsx  ✅  — 5 onglets : Accueil, Chronologie, Analyse, Partager, Profil
│   │   │   │   ├── index.tsx  🟡  — Écran : Tableau de bord — L2-05, L2-06, L2-07, L2-08
│   │   │   │   ├── insights.tsx  🟡  — Écran : Analyse — L3-04, L3-09
│   │   │   │   ├── profile.tsx  🟡  — Écran : Profil — L1-05
│   │   │   │   ├── share.tsx  🟡  — Écran : Partager — L5-06
│   │   │   │   └── timeline.tsx  🟡  — Écran : Chronologie — L2-09, L4-09
│   │   │   ├── emergency/
│   │   │   │   ├── edit.tsx  🟡  — Écran : Modifier ma carte d'urgence — L6-06
│   │   │   │   └── index.tsx  🟡  — Écran : Carte d'urgence — L6-06
│   │   │   ├── event/
│   │   │   │   └── new.tsx  🟡  — Écran : Nouvel événement — L2-10
│   │   │   ├── import/
│   │   │   │   ├── index.tsx  🟡  — Écran : Importer des données — L4-05
│   │   │   │   ├── mapping.tsx  🟡  — Écran : Correspondance des colonnes — L4-06
│   │   │   │   └── report.tsx  🟡  — Écran : Rapport d'importation — L4-07
│   │   │   ├── insights/
│   │   │   │   └── ask.tsx  🟡  — Écran : Poser une question — L3-08
│   │   │   ├── measurement/
│   │   │   │   ├── [id].tsx  🟡  — Écran : Détail d'une mesure — L2-11
│   │   │   │   └── new.tsx  🟡  — Écran : Nouvelle mesure — L2-03, L2-04
│   │   │   ├── report/
│   │   │   │   └── index.tsx  🟡  — Écran : Préparer ma consultation — L6-03
│   │   │   ├── settings/
│   │   │   │   ├── about.tsx  🟡  — Écran : À propos — L1-10
│   │   │   │   ├── index.tsx  🟡  — Écran : Paramètres — L1-05
│   │   │   │   ├── notifications.tsx  🟡  — Écran : Notifications — L8-15, L8-12, L8-13
│   │   │   │   ├── security.tsx  🟡  — Écran : Sécurité — L1-09
│   │   │   │   └── units-thresholds.tsx  🟡  — Écran : Unités et seuils — L1-05
│   │   │   ├── share/
│   │   │   │   ├── active.tsx  🟡  — Écran : QR de partage — L5-07, L5-08
│   │   │   │   ├── log.tsx  🟡  — Écran : Qui a consulté mes données — L5-09
│   │   │   │   └── new.tsx  🟡  — Écran : Partager mon historique — L5-06
│   │   │   ├── _layout.tsx  ✅  — Layout racine : providers + modales de saisie
│   │   │   └── index.tsx  ✅  — Redirection selon la session (à compléter : L1-07)
│   │   ├── assets/
│   │   │   └── README.md  — Icônes et écran de lancement à fournir (L7-04)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   └── ui/
│   │   │   │       ├── Button.tsx  ✅  — Bouton accessible (48 px)
│   │   │   │       ├── Card.tsx  ✅  — Carte
│   │   │   │       ├── index.ts  ✅  — Export du design system
│   │   │   │       ├── RangeBadge.tsx  ✅  — Badge d'état : couleur + symbole + libellé
│   │   │   │       ├── Screen.tsx  ✅  — Écran avec zone sûre
│   │   │   │       ├── ScreenStub.tsx  ✅  — Écran provisoire à supprimer au fil des tickets
│   │   │   │       └── Text.tsx  ✅  — Texte themé
│   │   │   ├── db/
│   │   │   │   ├── repositories/
│   │   │   │   │   ├── measurements.repo.ts  ✅  — Mesures : écriture locale + outbox DANS la même transaction
│   │   │   │   │   └── outbox.repo.ts  ✅  — Outbox : file des opérations à synchroniser
│   │   │   │   ├── client.ts  ✅  — Ouverture de la base + migrations automatiques
│   │   │   │   └── schema.ts  ✅  — SQLite locale : migrations v1 (mesures, événements, outbox, kv)
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── dashboard/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── emergency/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── events/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── imports/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── insights/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── measurements/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── notifications/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── profile/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── report/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── sharing/
│   │   │   │   │   ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   ├── sync/
│   │   │   │   │   ├── __tests__/
│   │   │   │   │   │   └── coalesce.test.ts  ✅  — Tests de la coalescence
│   │   │   │   │   ├── coalesce.ts  ✅  — Coalescence de l'outbox (fonction pure, TESTÉE)
│   │   │   │   │   ├── connectivity.ts  ✅  — Détection du réseau et retour en ligne
│   │   │   │   │   ├── engine.ts  🟡  — Moteur de sync : algorithme documenté, À IMPLÉMENTER (L8-06)
│   │   │   │   │   ├── index.ts  ✅  — Export public de la feature sync
│   │   │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   │   └── timeline/
│   │   │   │       ├── index.ts  🟡  — Point d'entrée public de la feature
│   │   │   │       └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│   │   │   ├── i18n/
│   │   │   │   ├── en.json  — Textes anglais (V2)
│   │   │   │   ├── fr.json  — Textes français
│   │   │   │   └── index.ts  ✅  — i18next (français par défaut)
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts  ✅  — Client HTTP avec jeton
│   │   │   │   ├── config.ts  ✅  — URL de l'API
│   │   │   │   ├── secure-storage.ts  ✅  — Jetons dans SecureStore (Keystore/Keychain)
│   │   │   │   └── uuid.ts  ✅  — UUID générés sur l'appareil (hors-ligne)
│   │   │   ├── providers/
│   │   │   │   └── AppProviders.tsx  ✅  — React Query + i18n (+ démarrage de la sync : L8-06)
│   │   │   └── theme/
│   │   │       └── index.ts  ✅  — Thème clair/sombre depuis @glyka/ui-tokens
│   │   ├── .env.example  — URL de l'API vue depuis le téléphone
│   │   ├── app.config.ts  ✅  — Config Expo : plugins, permissions, URL de l'API
│   │   ├── babel.config.js  — Babel Expo
│   │   ├── eas.json  — Profils de build (development, preview, production)
│   │   ├── metro.config.js  — Metro (monorepo)
│   │   ├── package.json  — Dépendances (Expo, SQLite, notifications, QR…)
│   │   ├── README.md  — Architecture local-first, démarrage, structure, règles
│   │   └── tsconfig.json  — TypeScript + alias @/
│   └── portal/  — Portail médecin React + Vite (lecture seule)
│       ├── public/
│       ├── src/
│       │   ├── components/
│       │   │   └── Stub.tsx  ✅  — Page provisoire à supprimer au fil des tickets
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│       │   │   ├── patient-record/
│       │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│       │   │   ├── report/
│       │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│       │   │   ├── scanner/
│       │   │   │   └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│       │   │   └── sessions/
│       │   │       └── README.md  — Rôle, tickets, fichiers prévus, règle importante
│       │   ├── lib/
│       │   │   ├── api-client.ts  ✅  — Client HTTP du portail
│       │   │   └── config.ts  ✅  — URL de l'API
│       │   ├── routes/
│       │   │   ├── expired.tsx  🟡  — Page : Accès expiré — L5-13
│       │   │   ├── login.tsx  🟡  — Page : Connexion médecin — L1-11
│       │   │   ├── patient-record.tsx  🟡  — Page : Dossier patient — L5-12, L5-13
│       │   │   ├── patients.tsx  🟡  — Page : Mes patients partagés — L5-11
│       │   │   ├── pending.tsx  🟡  — Page : Compte en attente de validation — L1-11
│       │   │   ├── register.tsx  🟡  — Page : Inscription médecin — L1-11
│       │   │   └── scan.tsx  🟡  — Page : Scanner un QR patient — L5-10
│       │   ├── styles/
│       │   │   └── index.css  — Tailwind + jetons de l'identité Glyka
│       │   ├── main.tsx  ✅  — Démarrage React + React Query
│       │   └── router.tsx  ✅  — Routes (à protéger : L1-11)
│       ├── .env.example  — URL de l'API
│       ├── index.html  — Page d'entrée
│       ├── package.json  — Dépendances (React, Vite, Tailwind, recharts, scanner QR)
│       ├── README.md  — Structure et règles du portail
│       ├── tsconfig.json  — TypeScript
│       └── vite.config.ts  ✅  — Vite + React + Tailwind
├── docs/  — Documentation du projet
│   ├── adr/
│   │   ├── 0000-template.md  — Modèle de décision d'architecture
│   │   ├── 0001-monorepo-pnpm-turborepo.md  — Pourquoi un monorepo
│   │   ├── 0002-unite-canonique-mg-dl.md  — Pourquoi tout stocker en mg/dL entier
│   │   ├── 0003-qr-dynamique-jetons-opaques.md  — Conception et menaces du QR dynamique
│   │   ├── 0004-offline-first.md  — Architecture hors-ligne (local-first, outbox, sync)
│   │   ├── 0005-analyse-deterministe-llm-reformule.md  — L'IA reformule, ne calcule pas
│   │   └── 0006-notifications.md  — Notifications locales + push, sans valeur de santé par défaut
│   ├── api/
│   │   └── README.md  — Contrat OpenAPI et règle de changement
│   ├── cahier-des-charges/
│   │   └── CDC_MVP_Glyka.md  — CAHIER DES CHARGES DU MVP v0.2 (12 fonctionnalités, validé)
│   ├── demo/
│   │   └── scenario.md  — Scénario de démonstration de 7 minutes + comptes
│   ├── design/
│   │   └── README.md  — Principes de design et liste des écrans
│   ├── security/
│   │   └── checklist.md  — Checklist de sécurité (point du jour 7)
│   ├── team/
│   │   ├── templates/
│   │   │   ├── compte-rendu.md  — Modèle de compte rendu
│   │   │   ├── ordre-du-jour.md  — Modèle d'ordre du jour
│   │   │   └── plan-d-action.md  — Modèle de plan d'action
│   │   ├── backlog.csv  — 105 tickets (source de vérité, importable)
│   │   ├── backlog.md  — Backlog lisible par lot
│   │   ├── github-setup.md  — Mise en place de GitHub pas à pas
│   │   ├── plan-de-travail.md  — Rôles, chemin critique, tickets jour par jour, règle de coupe
│   │   └── rituels.md  — Daily, revues, réunions de décision
│   ├── ARBORESCENCE_GLYKA.md  — Ce document : arborescence annotée, lots, vérifications, premiers pas
│   └── README.md  — Index de la documentation
├── infra/  — Docker et exécution locale
│   ├── docker/
│   │   └── api.Dockerfile  — Image de l'API (à finaliser : L0-05)
│   └── README.md  — Contenu et responsable (lot L0)
├── packages/
│   ├── analytics/  — MOTEUR D'ANALYSE déterministe (tourne aussi sur le téléphone)
│   │   ├── src/
│   │   │   ├── anomalies.ts  ✅  — Score z modifié par créneau, séries hautes, hypoglycémies
│   │   │   ├── index.ts  ✅  — Export public
│   │   │   ├── insights.ts  ✅  — analyze() : observations traçables (preuves = mesures)
│   │   │   ├── quality.ts  ✅  — Score de qualité 0–100 (couverture, densité, fraîcheur)
│   │   │   ├── slots.ts  ✅  — Créneaux matin / midi / soir / nuit
│   │   │   ├── stats.ts  ✅  — Moyenne, écart-type, médiane, temps dans la cible
│   │   │   ├── templates.fr.ts  ✅  — Phrases françaises, jamais de diagnostic ni de dose
│   │   │   └── types.ts  ✅  — Types : points, période, stats, qualité, observation
│   │   ├── test/
│   │   │   ├── quality.test.ts  ✅  — Tests : score de qualité
│   │   │   └── stats.test.ts  ✅  — Tests : stats, anomalies, habitude vs anomalie
│   │   ├── package.json  — Build tsup
│   │   ├── README.md  — Principe : les chiffres viennent d'ici, l'IA reformule
│   │   └── tsconfig.json  — TypeScript
│   ├── shared/  — CONTRAT COMMUN : schémas Zod, unités, seuils, enums
│   │   ├── src/
│   │   │   ├── schemas/  — Schémas Zod par domaine
│   │   │   │   ├── auth.ts  ✅  — Inscription, connexion, mot de passe (12 car. min.)
│   │   │   │   ├── emergency.ts  ✅  — Carte d'urgence
│   │   │   │   ├── event.ts  ✅  — Repas, activité, traitement déclaré
│   │   │   │   ├── import.ts  ✅  — Import : correspondance, rapport, décisions
│   │   │   │   ├── index.ts  ✅  — Export des schémas
│   │   │   │   ├── measurement.ts  ✅  — Mesure (UUID client, valeur, unité, contexte)
│   │   │   │   ├── notification.ts  ✅  — Préférences de notifications, enregistrement d'appareil
│   │   │   │   ├── profile.ts  ✅  — Profil patient et seuils (cohérence vérifiée)
│   │   │   │   ├── share.ts  ✅  — Partage : catégories, durée, claim
│   │   │   │   └── sync.ts  ✅  — Protocole de synchronisation (push/pull, idempotence)
│   │   │   ├── constants.ts  ✅  — TTL du QR (60 s), durées, limites d'import, règles de mot de passe
│   │   │   ├── enums.ts  ✅  — Énumérations (types de diabète, unités, catégories de partage, notifications, sync…)
│   │   │   ├── index.ts  ✅  — Export public
│   │   │   ├── thresholds.ts  ✅  — Seuils par défaut (à valider), classification, symboles d'état
│   │   │   └── units.ts  ✅  — Conversions g/L · mg/dL · mmol/L, plausibilité, formatage (ADR-0002)
│   │   ├── test/
│   │   │   └── units.test.ts  ✅  — Tests : conversions, plausibilité, classification
│   │   ├── package.json  — Build tsup (ESM + CJS)
│   │   ├── README.md  — Rôle et règles du paquet
│   │   └── tsconfig.json  — TypeScript
│   └── ui-tokens/  — IDENTITÉ VISUELLE (couleurs, typo, espacements)
│       ├── src/
│       │   ├── colors.ts  ✅  — Palette Glyka (clair/sombre) + couleurs d'états
│       │   ├── index.ts  ✅  — Export
│       │   ├── spacing.ts  ✅  — Espacements et rayons
│       │   └── typography.ts  ✅  — Manrope (titres), Inter (texte)
│       ├── package.json  — Build tsup
│       ├── README.md  — Rôle et règles
│       └── tsconfig.json  — TypeScript
├── scripts/  — Outils d'équipe : démo, administration, GitHub
│   ├── admin/
│   │   └── approve-doctor.ts  ✅  — Approuve / rejette un compte médecin
│   ├── github/
│   │   ├── create-issues.sh  — Crée les 105 issues depuis backlog.csv (--dry-run)
│   │   └── create-labels.sh  — Crée les labels depuis .github/labels.yml
│   ├── sample-data/
│   │   ├── generate_import_demo.py  — Génère les fichiers d'import de test (déterministe)
│   │   ├── import-corrupted.xlsx  — Faux classeur : l'API doit répondre par une erreur claire
│   │   ├── import-demo-147.csv  — 147 lignes : 139 valides, 5 doublons, 3 incohérentes (18,7 g/L ligne 42)
│   │   └── import-windows1252.csv  — Test d'encodage Windows-1252 (accents)
│   ├── seed-demo/
│   │   ├── generators/
│   │   │   ├── glucose-series.test.ts  ✅  — Tests du générateur (3/3 passent)
│   │   │   └── glucose-series.ts  ✅  — Générateur déterministe de glycémies fictives (3 profils)
│   │   └── index.ts  ✅  — Crée 3 patients fictifs + un médecin approuvé (à valider sur la vraie base)
│   ├── package.json  — Scripts : seed:demo, admin:approve-doctor…
│   ├── README.md  — Mode d'emploi des scripts
│   └── tsconfig.json  — TypeScript
├── .editorconfig  — Style d'édition commun (UTF-8, LF, 2 espaces)
├── .env.example  — Variables communes (PostgreSQL local) — JAMAIS de vrai secret
├── .gitignore  — Fichiers ignorés (.env, dist, node_modules…)
├── .npmrc  — node-linker=hoisted (requis par Expo avec pnpm)
├── .nvmrc  — Version de Node (20)
├── .prettierignore  — Fichiers ignorés par Prettier
├── .prettierrc  — Règles de formatage
├── commitlint.config.cjs  — Commits au format conventionnel (scopes autorisés)
├── CONTRIBUTING.md  — Flux de travail Git, conventions, définition de « terminé »
├── docker-compose.yml  — PostgreSQL + Mailpit (+ API en profil « full »)
├── eslint.config.mjs  — ESLint partagé (à compléter : L0-03)
├── package.json  — Scripts racine : dev, build, lint, test, db:*
├── pnpm-workspace.yaml  — Espaces de travail : apps/*, packages/*, scripts
├── README.md  — Présentation du projet, structure, démarrage rapide
├── SECURITY.md  — Règles de sécurité non négociables
├── tsconfig.base.json  — TypeScript strict, partagé par tous les paquets
└── turbo.json  — Orchestration des tâches (build, lint, typecheck, test)
```

## 4. Ce qui a été vérifié, et ce qui ne l'a pas été
**Exécuté ici avec succès :**
- Typage strict de `@glyka/shared` (hors schémas Zod) et `@glyka/analytics` + vérifications chiffrées (conversions d'unités, statistiques, score de qualité, anomalies, règle « moins de 10 mesures = pas d'analyse »)
- Helpers de sécurité de l'API : chiffrement AES-256-GCM (aller-retour, altération détectée), jetons opaques et hash
- `coalesceOps` (synchronisation mobile) : 4 comportements
- Générateur de données de démo : 3/3 tests ; les 3 profils donnent bien qualité **96 % Bonne / 60 % Partielle / 34 % Insuffisante**
- Fichiers d'import : **139 valides, 5 doublons, 3 incohérentes** (ligne 42 = 18,7 g/L) recomptés indépendamment
- Syntaxe des **176 fichiers** TypeScript/TSX ; validité de tous les JSON et YAML ; références entre paquets ; aucun secret ni `.env` dans le dépôt

**NON exécuté (pas d'accès au réseau ici) :**
- `pnpm install` n'a **jamais** été lancé : versions de dépendances à aligner au **jour 1** (notamment `npx expo install --fix`, SDK Expo 54 supposé)
- L'API, le mobile et le portail n'ont **pas été compilés ni démarrés** : seule leur syntaxe est vérifiée
- Les schémas Zod, la migration Prisma, `seed-demo/index.ts` et `admin/approve-doctor.ts` sont à valider contre une vraie base
- Le chiffrement SQLite locale (SQLCipher) est désactivé : à décider (L8-02)
- Le push Android exige un development build et Firebase (L0-11)

Ces points sont des tickets du backlog (L0-02, L0-11, L8-02, L7-07, L1-12), pas des oublis.

## 5. Premiers pas du chef technique (jour 1)
1. Lire `docs/team/github-setup.md` : créer le dépôt, `develop`, protections, labels, tableau, jalons.
2. `scripts/github/create-issues.sh --dry-run` puis sans l'option : 105 issues créées.
3. Assigner les lots selon `docs/team/plan-de-travail.md` (rôles proposés, chemin critique, règle de coupe).
4. Lancer `pnpm install`, corriger les versions, ouvrir la PR du ticket **L0-02**.
5. Réunion de décision : valider les ADR 0001 à 0006 (L0-09, L8-01) et le contrat OpenAPI v0 (L0-07).
