# Contrat d'API (v0)

Le contrat **OpenAPI v0** est **gelé** (ticket L0-07). Le mobile et le portail développent contre lui **avant** que l'API soit prête : chaque route, chaque champ et chaque erreur y est décrit, avec des exemples.

> **Pourquoi un contrat écrit à la main, et pas exporté du code ?** Aujourd'hui l'API ne code qu'une seule route (`/health`) : un export du code ne décrirait presque rien. Le contrat décrit donc **toutes** les routes prévues ; des tests le comparent aux schémas Zod de `@glyka/shared` et au code, pour qu'il ne puisse pas dériver en silence.

## Fichiers

| Fichier                  | Rôle                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `openapi.v0.json`        | **Le contrat gelé** (version 0.4.1) : 57 opérations, 110 schémas. Écrit à la main, vérifié par des tests. |
| `openapi.generated.json` | Ce que le code produit réellement (`pnpm --filter @glyka/api openapi:export`). Non versionné.             |
| `CHANGELOG.md`           | Historique des changements du contrat.                                                                    |
| `REVUE-SCHEMAS.md`       | Relecture des schémas partagés (ticket L0-08) : défauts corrigés, points à décider, validation par rôle.  |

## Utiliser le contrat

1. **Le lire et l'essayer** : ouvre <https://editor.swagger.io>, menu _File → Import file_, choisis `docs/api/openapi.v0.json`.
2. **Développer sans API** (mobile, portail) : un serveur de simulation répond avec les exemples du contrat.

   ```bash
   pnpm dlx @stoplight/prism-cli mock docs/api/openapi.v0.json --port 4010
   ```

   Puis pointe l'application vers `http://localhost:4010` (`EXPO_PUBLIC_API_URL` côté mobile, `VITE_API_URL` côté portail).

3. **Valider une donnée** : utilise les schémas Zod de `@glyka/shared`, les mêmes que ceux de l'API.

## Ce que les tests garantissent

`pnpm --filter @glyka/api test` exécute `openapi-contract.test.ts` et `openapi-drift.test.ts`.

| Test               | Ce qu'il empêche                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | Référence cassée, `operationId` en double, paramètre de chemin non déclaré, route du cahier des charges oubliée                 |
| Sécurité           | Une route devenue publique par erreur (liste blanche de 9 routes), un rôle incohérent, un `401` oublié                          |
| Énumérations       | Une valeur ajoutée dans `@glyka/shared` sans mettre à jour le contrat (et inversement)                                          |
| Requêtes           | Un champ ajouté, retiré ou rendu obligatoire dans un schéma Zod sans mettre à jour le contrat ; un exemple que l'API refuserait |
| Écart avec le code | Une route codée qui n'est pas décrite dans le contrat (`openapi-drift.test.ts`)                                                 |

## Règle de changement

- **Compatible** (autorisé) : ajouter une route, ajouter un champ **optionnel**, ajouter une réponse d'erreur.
- **Rupture** (à éviter) : retirer ou renommer une route ou un champ, rendre un champ obligatoire, changer un type ou une valeur d'énumération.

Toute modification du contrat :

1. est annoncée à l'équipe **avant** la fusion, et la PR porte le label `contract-change` ;
2. met à jour **dans la même PR** le contrat, le schéma Zod concerné de `packages/shared` et `CHANGELOG.md` ;
3. fait passer les tests ci-dessus (ils indiquent précisément ce qui n'est pas aligné) ;
4. si c'est une rupture, est validée par le lead technique.

Le fichier est long : modifie-le dans un éditeur JSON, garde les extensions `x-roles`, `x-lot`, `x-ticket`, `x-priority`, `x-status`, et relance les tests.

## Conventions

- **Glycémie** : toujours en **mg/dL entier** (`valueMgDl`), avec la valeur saisie et son unité d'origine. 1 g/L = 100 mg/dL.
- **Identifiants créés par le client** : une mesure ou un événement porte un UUID généré sur l'appareil ; rejouer une requête ne crée jamais de doublon (`201` à la création, `200` au rejeu).
- **Erreurs** : `{ message, code?, issues?, retryAfterSeconds? }`, sans détail interne ni donnée de santé.
- **Pagination** : `limit` et `cursor` opaque ; réponse `{ items, nextCursor }`.
- **Authentification** : `Authorization: Bearer <jeton d'accès>` (15 minutes). Neuf routes seulement sont publiques.

## Décisions de conception à valider

Ces choix sont **proposés** ; le lead technique les valide avant de s'appuyer dessus.

1. **Pas d'énumération de comptes** : `register` et `forgot-password` répondent toujours `202`, que l'adresse existe ou non.
2. **Valeur inhabituelle** : `422` avec le code `UNUSUAL_VALUE` ; le client redemande confirmation puis renvoie avec `confirmedUnusual: true`.
3. **Compte verrouillé** : `429` avec le code `ACCOUNT_LOCKED` et un délai (`Retry-After`).
4. **QR de consultation** : contient le jeton brut. **QR d'urgence** : contient une **adresse** (page publique du portail), car n'importe quel téléphone doit pouvoir le lire.
5. **Jeton d'urgence** : montré une seule fois à la génération (le serveur ne garde que son empreinte) ; l'application le conserve, et le **régénère** après une réinstallation.
6. **Synchronisation** : `GET /sync/pull` renvoie mesures **et** événements dans une seule réponse, suppressions comprises, avec un curseur à ne conserver qu'après application de la page.
7. **Routes ajoutées** par rapport au cahier des charges (§10) : `POST /auth/logout`, `DELETE /devices/{deviceId}` (retirer l'appareil à la déconnexion, sinon les notifications continuent) et les 5 routes de lecture du médecin sous `/doctor/sessions/…`.
8. **Ticket manquant** : ces 5 routes de lecture du médecin n'avaient aucun ticket côté API ; elles portent `L5-15` (à créer dans le backlog).
9. **Page publique du portail** : `/e/:token` (carte d'urgence) n'est pas dans la liste des pages du portail ; à ajouter avec les tickets L6-05 et L6-06.

## Table des routes

Générée par `node scripts/openapi/routes.mjs --write` : ne la modifie pas à la main.

<!-- routes:start -->

### health

Santé de l'API.

| Méthode | Chemin    | Accès  | Prio | État  | Ticket |
| ------- | --------- | ------ | ---- | ----- | ------ |
| GET     | `/health` | public | P0   | codée | L0-04  |

### auth

Comptes et sessions (patients et médecins).

| Méthode | Chemin                  | Accès    | Prio | État    | Ticket |
| ------- | ----------------------- | -------- | ---- | ------- | ------ |
| POST    | `/auth/forgot-password` | public   | P0   | à coder | L1-03  |
| POST    | `/auth/login`           | public   | P0   | à coder | L1-02  |
| POST    | `/auth/logout`          | connecté | P0   | à coder | L1-02  |
| POST    | `/auth/refresh`         | public   | P0   | à coder | L1-02  |
| POST    | `/auth/register`        | public   | P0   | à coder | L1-01  |
| POST    | `/auth/register-doctor` | public   | P0   | à coder | L1-01  |
| POST    | `/auth/reset-password`  | public   | P0   | à coder | L1-03  |
| POST    | `/auth/verify-email`    | public   | P0   | à coder | L1-01  |

### account

Profil médical, export et suppression de compte.

| Méthode | Chemin        | Accès   | Prio | État    | Ticket |
| ------- | ------------- | ------- | ---- | ------- | ------ |
| DELETE  | `/me`         | patient | P1   | à coder | L1-14  |
| GET     | `/me/export`  | patient | P1   | à coder | L1-14  |
| GET     | `/me/profile` | patient | P0   | à coder | L1-05  |
| PUT     | `/me/profile` | patient | P0   | à coder | L1-05  |

### measurements

Mesures de glycémie.

| Méthode | Chemin               | Accès   | Prio | État    | Ticket |
| ------- | -------------------- | ------- | ---- | ------- | ------ |
| GET     | `/measurements`      | patient | P0   | à coder | L2-01  |
| POST    | `/measurements`      | patient | P0   | à coder | L2-01  |
| PUT     | `/measurements/{id}` | patient | P0   | à coder | L2-01  |
| DELETE  | `/measurements/{id}` | patient | P0   | à coder | L2-01  |

### events

Repas, activité, traitements déclarés.

| Méthode | Chemin         | Accès   | Prio | État    | Ticket |
| ------- | -------------- | ------- | ---- | ------- | ------ |
| GET     | `/events`      | patient | P0   | à coder | L2-02  |
| POST    | `/events`      | patient | P0   | à coder | L2-02  |
| PUT     | `/events/{id}` | patient | P0   | à coder | L2-02  |
| DELETE  | `/events/{id}` | patient | P0   | à coder | L2-02  |

### sync

Synchronisation de la saisie hors-ligne.

| Méthode | Chemin       | Accès   | Prio | État    | Ticket |
| ------- | ------------ | ------- | ---- | ------- | ------ |
| GET     | `/sync/pull` | patient | P0   | à coder | L8-05  |
| POST    | `/sync/push` | patient | P0   | à coder | L8-04  |

### imports

Import CSV / Excel avec rapport de validation.

| Méthode | Chemin                 | Accès   | Prio | État    | Ticket |
| ------- | ---------------------- | ------- | ---- | ------- | ------ |
| POST    | `/imports/preview`     | patient | P0   | à coder | L4-04  |
| DELETE  | `/imports/{id}`        | patient | P0   | à coder | L4-04  |
| POST    | `/imports/{id}/commit` | patient | P0   | à coder | L4-04  |

### insights

Analyse, qualité des données, question libre.

| Méthode | Chemin          | Accès   | Prio | État    | Ticket |
| ------- | --------------- | ------- | ---- | ------- | ------ |
| GET     | `/insights`     | patient | P0   | à coder | L3-03  |
| POST    | `/insights/ask` | patient | P1   | à coder | L3-08  |
| GET     | `/quality`      | patient | P0   | à coder | L3-03  |

### sharing

Partage par QR dynamique : sessions, jetons rotatifs, révocation, journal d'accès.

| Méthode | Chemin                | Accès   | Prio | État    | Ticket |
| ------- | --------------------- | ------- | ---- | ------- | ------ |
| POST    | `/shares`             | patient | P0   | à coder | L5-01  |
| POST    | `/shares/claim`       | médecin | P0   | à coder | L5-03  |
| GET     | `/shares/log`         | patient | P0   | à coder | L5-05  |
| DELETE  | `/shares/{id}`        | patient | P0   | à coder | L5-04  |
| GET     | `/shares/{id}/status` | patient | P0   | à coder | L5-04  |
| GET     | `/shares/{id}/token`  | patient | P0   | à coder | L5-02  |

### doctor

Portail médecin : lecture seule, filtrée par catégories et durée.

| Méthode | Chemin                                      | Accès   | Prio | État    | Ticket |
| ------- | ------------------------------------------- | ------- | ---- | ------- | ------ |
| GET     | `/doctor/sessions`                          | médecin | P0   | à coder | L5-15  |
| GET     | `/doctor/sessions/{sessionId}/measurements` | médecin | P0   | à coder | L5-15  |
| GET     | `/doctor/sessions/{sessionId}/report`       | médecin | P0   | à coder | L5-15  |
| GET     | `/doctor/sessions/{sessionId}/summary`      | médecin | P0   | à coder | L5-15  |
| GET     | `/doctor/sessions/{sessionId}/timeline`     | médecin | P0   | à coder | L5-15  |

### reports

Rapport PDF « Préparer ma consultation ».

| Méthode | Chemin                  | Accès   | Prio | État    | Ticket |
| ------- | ----------------------- | ------- | ---- | ------- | ------ |
| GET     | `/reports/consultation` | patient | P0   | à coder | L6-02  |

### emergency

Carte d'urgence et son QR.

| Méthode | Chemin                  | Accès   | Prio | État    | Ticket |
| ------- | ----------------------- | ------- | ---- | ------- | ------ |
| GET     | `/e/{token}`            | public  | P1   | à coder | L6-05  |
| GET     | `/emergency`            | patient | P1   | à coder | L6-05  |
| PUT     | `/emergency`            | patient | P1   | à coder | L6-05  |
| POST    | `/emergency/regenerate` | patient | P1   | à coder | L6-05  |

### notifications

Appareils et préférences de notification.

| Méthode | Chemin                       | Accès    | Prio | État    | Ticket |
| ------- | ---------------------------- | -------- | ---- | ------- | ------ |
| POST    | `/devices`                   | connecté | P0   | à coder | L8-14  |
| DELETE  | `/devices/{deviceId}`        | connecté | P0   | à coder | L8-14  |
| GET     | `/notifications/preferences` | patient  | P0   | à coder | L8-14  |
| PUT     | `/notifications/preferences` | patient  | P0   | à coder | L8-14  |

### assistant

Assistant de conversation « Afyabora » (lot L9, ADR-0005) : questions sur ses mesures et sur le diabète, réponses tirées de fiches relues par un médecin, jamais de dose ni de diagnostic.

| Méthode | Chemin                                   | Accès   | Prio | État    | Ticket |
| ------- | ---------------------------------------- | ------- | ---- | ------- | ------ |
| GET     | `/assistant/conversations`               | patient | P1   | à coder | L9-05  |
| POST    | `/assistant/conversations`               | patient | P1   | à coder | L9-05  |
| DELETE  | `/assistant/conversations`               | patient | P1   | à coder | L9-05  |
| GET     | `/assistant/conversations/{id}`          | patient | P1   | à coder | L9-05  |
| DELETE  | `/assistant/conversations/{id}`          | patient | P1   | à coder | L9-05  |
| POST    | `/assistant/conversations/{id}/messages` | patient | P1   | à coder | L9-05  |
| GET     | `/assistant/sheets`                      | patient | P1   | à coder | L9-06  |
| GET     | `/assistant/sheets/{sheetId}`            | patient | P1   | à coder | L9-06  |

**57 opérations.**

<!-- routes:end -->
