# @glyka/api — API NestJS

Back-end de Glyka : comptes, mesures, **synchronisation hors-ligne**, import, analyse, **partage par QR dynamique**, portail médecin, rapport PDF, carte d'urgence, notifications.

## Démarrer

```bash
cp apps/api/.env.example apps/api/.env     # puis générer les secrets (voir le fichier)
pnpm db:up                                  # PostgreSQL + Mailpit (http://localhost:8025)
pnpm --filter @glyka/api prisma:migrate     # crée les tables
pnpm dev:api                                # http://localhost:3000 — Swagger : /docs
```

## Structure

```
src/
├─ main.ts · app.module.ts          # démarrage, modules, guards globaux (throttler → JWT → rôles)
├─ config/env.ts                    # variables d'environnement validées (Zod) — l'API refuse de démarrer sinon
├─ prisma/                          # PrismaService (global)
├─ common/
│  ├─ decorators/                   # @Public, @Roles, @CurrentUser
│  ├─ guards/                       # JwtAuthGuard (global), RolesGuard
│  ├─ pipes/zod-validation.pipe.ts  # valide body/query avec les schémas de @glyka/shared
│  ├─ filters/                      # erreurs homogènes, sans détail interne
│  └─ crypto/                       # jetons opaques + hash ; AES-256-GCM pour les notes
├─ modules/                         # UN dossier = UN domaine (README dans chacun)
└─ scripts/export-openapi.ts        # exporte le contrat vers docs/api/openapi.json
prisma/schema.prisma                # modèle de données
test/                               # tests transverses (crypto, e2e)
```

## Modules

| Module                         | Lot | Fonctionnalité                           |
| ------------------------------ | --- | ---------------------------------------- |
| `health`                       | L0  | Vérification de l'API                    |
| `auth`                         | L1  | F1 — comptes et sessions                 |
| `patients`                     | L1  | F1 — profil, seuils, export, suppression |
| `measurements` · `events`      | L2  | F2, F4                                   |
| `sync`                         | L8  | F11 — synchronisation hors-ligne         |
| `imports`                      | L4  | F5                                       |
| `insights`                     | L3  | F6 — analyse + IA                        |
| `sharing` · `audit` · `doctor` | L5  | F7, F8 — **QR dynamique et portail**     |
| `reports` · `emergency`        | L6  | F9, F10                                  |
| `notifications`                | L8  | F12 — push serveur                       |

## Règles du projet

- Un contrôleur **ne contient pas de logique métier** : il valide (Zod), appelle le service, renvoie.
- Chaque route vérifie le **rôle** et la **propriété** de la donnée.
- **Chaque route porte `@Public()` OU `@Roles(...)`, exactement comme l'extension `x-roles` du contrat** (`docs/api/openapi.v0.json`). Le test `test/roles-contract.test.ts` le vérifie pour toutes les routes codées : une route sans décorateur, ou avec d'autres rôles, fait échouer la CI.
- Sans `@Public()`, une route exige un jeton d'accès valide (garde globale, sécurité par défaut). Ordre des gardes : limite de débit → `JwtAuthGuard` (401 « qui es-tu ? ») → `RolesGuard` (403 « as-tu le droit ? »).
- `JwtAuthGuard` n'accepte que des JWT **HS256** signés avec notre secret, non expirés, contenant `sub` (UUID) et `role` (PATIENT, DOCTOR ou ADMIN) ; toute autre forme → 401 avec un message unique.
- Les chiffres médicaux viennent de `@glyka/analytics`, jamais recalculés à la main.
- Aucun secret ni donnée de santé dans les logs.
- Tests : `pnpm --filter @glyka/api test` (Vitest + SWC).

## État actuel

Faits : `GET /health` (L0-04), authentification complète (`auth` : L1-01 à L1-03), gardes JWT et rôles renforcées et testées (L1-04), envoi d'emails (`common/mail`, Mailpit en local).
Les autres modules sont **à implémenter** selon le backlog (`docs/team/backlog.md`).
