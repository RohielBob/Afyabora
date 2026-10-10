# Feature `auth` — Authentification médecin

**Lot L1 · Fonctionnalité F8**

Inscription, connexion, session, statut du compte (en attente / approuvé / refusé), et les pages des
liens envoyés par email (vérification d'adresse, nouveau mot de passe).

## Tickets

- **L1-11** — Portail : inscription et connexion médecin, page « compte en attente » — **fait**
- (avec L1-11) pages `/verify-email` et `/reset-password` du portail, demandées par les emails de l'API
  (L1-01, L1-03) — **faites**
- **L1-12** — Script d'administration : approuver un compte médecin (à faire)

## Parcours

```
/register ─► « Vérifiez votre boîte mail » ─► lien de l'email ─► /verify-email ─► /login
                                                                                   │
           compte PENDING ou REJECTED ─► /pending (aucun dossier)  ◄───────────────┤
           compte APPROVED ─────────────► /patients, /scan…        ◄───────────────┘
/login ─► « Mot de passe oublié ? » ─► /forgot-password ─► lien de l'email ─► /reset-password
```

- **Inscription** : identité, exercice (numéro d'ordre, établissement), accès (email, mot de passe), puis
  **deux cases jamais pré-cochées** : « je certifie être professionnel de santé » et « je respecte le
  secret médical, mes accès sont journalisés ». Le serveur reçoit `consent: true` seulement si les deux
  sont cochées (**contrat d'API inchangé**). Réponse identique que l'adresse existe ou non.
- **Connexion** : messages selon la réponse du serveur (identifiants incorrects, email non vérifié,
  compte bloqué + durée). Un **compte patient ou admin est refusé** : aucune session n'est gardée et les
  jetons reçus sont **révoqués tout de suite** (`POST /auth/logout`).
- **Compte en attente** (`/pending`) : explique la vérification, montre les 3 étapes, et propose « J'ai
  été approuvé : me reconnecter ». Pourquoi se reconnecter : le statut est donné par `POST /auth/login`,
  il n'existe pas de route pour le relire (contrat inchangé). Variante « compte non validé » (REJECTED).
- **Liens des emails** (`/verify-email`, `/reset-password`) : ouverts à tous, **patients compris** (la
  page dit à chacun quoi faire ensuite). Le jeton est **retiré de la barre d'adresse** dès sa lecture.

## Session (`session.ts`)

| Quoi                                      | Où                                    | Pourquoi                                                     |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| Jeton d'accès (15 min)                    | mémoire seulement                     | jamais lisible dans le stockage du navigateur                |
| Jeton de rafraîchissement + rôle / statut | `sessionStorage` (onglet)             | survit au rechargement, disparaît à la fermeture de l'onglet |
| Données patient                           | jamais stockées ; cache vidé à la fin | README du portail                                            |

- **Un seul renouvellement à la fois** (deux en parallèle seraient vus comme un vol de session, L1-02) ;
  une requête qui reçoit 401 renouvelle la session puis est rejouée une fois.
- Jeton refusé par le serveur ⇒ retour à la connexion avec « session expirée ». Serveur injoignable ⇒
  la session est gardée.
- **Déconnexion automatique après 30 min sans activité** (poste partagé en consultation), expliquée sur
  l'écran de connexion. Une session de l'onglet inactive depuis plus de 30 min n'est pas reprise.

## Gardes de routes (`guards.tsx`)

`GuestOnly` (connexion, inscription, mot de passe oublié) · `RequireDoctor` · `RequireApproved`
(patients, scan, dossier) · `PendingOnly` (`/pending`). Elles guident l'interface ; **la vraie
protection reste le serveur** (rôle et statut vérifiés à chaque requête).

## Fichiers

| Fichier                       | Rôle                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `api.ts`                      | Appels `/auth/*` (contrat d'API)                                                  |
| `rules.ts`                    | Validation (schémas de `@glyka/shared`), messages d'erreur, page après connexion… |
| `session.ts`                  | Session de l'onglet, renouvellement, déconnexion, inactivité                      |
| `guards.tsx`                  | Gardes de routes                                                                  |
| `components/PasswordRule.tsx` | Règle du mot de passe affichée en direct                                          |
| `__tests__/rules.test.ts`     | Règles sans interface                                                             |
| `__tests__/session.test.ts`   | Session avec un faux serveur                                                      |

Pages : `src/routes/login.tsx`, `register.tsx`, `verify-email.tsx`, `forgot-password.tsx`,
`reset-password.tsx`, `pending.tsx`.

## Tests obligatoires

- [x] Médecin en attente ou refusé ⇒ `/pending` ; approuvé ⇒ `/patients` ; patient / admin refusé.
- [x] Compte patient : aucune session gardée, jetons révoqués.
- [x] Inscription : chaque champ et chaque case exigés ; valeurs nettoyées ; `consent: true`.
- [x] Jeton d'accès jamais dans le stockage ; un seul renouvellement simultané ; 401 ⇒ renouvellement
      puis requête rejouée ; jeton refusé ⇒ « session expirée » et tout effacé.
- [x] Déconnexion : session révoquée côté serveur ; déconnexion automatique après 30 min d'inactivité.
- [x] Lien d'email : jeton absent ou mal formé refusé.

## Tester à la main

1. `pnpm db:up`, `pnpm dev:api`, puis `pnpm --filter @glyka/portal dev` → http://localhost:5173.
2. Créer un compte, ouvrir le lien dans Mailpit (http://localhost:8025) : la page `/verify-email` du
   portail confirme l'adresse.
3. Se connecter ⇒ « compte en attente ». Ouvrir `/patients` à la main ⇒ retour à `/pending`.
4. Approuver le compte (L1-12, ou en base de développement), puis « me reconnecter » ⇒ « Mes patients ».
