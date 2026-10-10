# Feature `auth` — Comptes et sessions côté téléphone

**Lot L1 · Fonctionnalité F1**

Écrans d'authentification, session, jetons dans SecureStore, verrouillage biométrique.

## Tickets

- **L1-06** — Mobile : écrans bienvenue, inscription, vérification email, connexion, mot de passe oublié — **fait**
- **L1-07** — Mobile : stockage sécurisé des jetons et rafraîchissement automatique de session — **fait**
- **L1-09** — Mobile : verrouillage de l'app par biométrie ou code — **fait** (feature `security`)
- **L1-10** — Mobile : consentement explicite et avertissement « outil d'aide, pas un avis médical » — **fait** (feature `legal`)

## Parcours (L1-06)

```
Accueil ─► Créer un compte ─► Vérifiez votre boîte mail ─► Adresse vérifiée ─► Se connecter
   │                              (coller le lien / renvoyer)                       │
   └──────────────► Se connecter ◄──────────────────────────────────────────────────┘
                       │  └─► Mot de passe oublié ─► Coller le lien + nouveau mot de passe ─► Modifié
                       ▼
          profil incomplet ─► Assistant de profil (L1-08)   ·   profil complet ─► Accueil (onglets)
```

- **Inscription** : email, mot de passe (règles affichées en direct), **deux cases jamais pré-cochées** (données de santé / avertissement médical, L1-10) avec un lien vers chaque texte. Mêmes règles que le serveur (schémas Zod de `@glyka/shared`).
- **Vérification** : le lien de l'email ouvre la page du portail (à créer). En attendant, on **colle le lien (ou le code)** dans l'app. « Renvoyer l'email » refait l'inscription avec les données gardées **en mémoire seulement** (`pending-registration.ts`), avec 60 s d'attente entre deux envois.
- **Connexion** : messages selon la réponse du serveur (identifiants incorrects, email non vérifié + bouton « Vérifier mon adresse », compte bloqué + durée). Un compte **médecin ou admin** est orienté vers le portail et **aucun jeton n'est gardé** sur le téléphone.
- **Mot de passe oublié** : 3 étapes sur un écran (demande → lien + nouveau mot de passe → réussite).
- Tous les textes sont dans `src/i18n/fr.json` (et `en.json`).

## Session (L1-07)

- **Démarrage** : si une session est enregistrée (coffre sécurisé), l'app s'ouvre **tout de suite** connectée, même **hors-ligne** (ADR-0004), puis renouvelle les jetons en arrière-plan. Si le serveur refuse (session révoquée/expirée) : retour à « Se connecter » avec le message « session expirée ».
- **Renouvellement automatique** : une route protégée qui répond 401 → `refreshSession()` puis la requête est rejouée une fois. **Un seul renouvellement à la fois** : plusieurs requêtes expirées attendent le même (deux renouvellements parallèles seraient vus comme un vol de session, voir L1-02). Hors-ligne : la session est gardée.
- **Déconnexion** (onglet Profil) : confirmation dans la page, avec avertissement s'il reste des modifications non envoyées ; session révoquée côté serveur si possible ; jetons, session **et base locale** effacés (ADR-0004 : un téléphone = un compte à la fois).
- **Écrans protégés** (`app/_layout.tsx`, `Stack.Protected`) : sans session, les onglets, réglages, mesures… sont refusés et l'app revient à `index` (réglage `unstable_settings.anchor`) ; connecté, les écrans de connexion sont refusés. La planche de style reste ouverte en développement.
- `app/index.tsx` choisit le premier écran : accueil / connexion (session expirée) / assistant de profil / onglets.

| Fichier                   | Rôle                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `api.ts`                  | Appels `/auth/*` (contrat d'API)                                                        |
| `errors.ts`               | Erreur de l'API → message clair (clé i18n) + action proposée                            |
| `validation.ts`           | Validation des formulaires avec les schémas de `@glyka/shared`                          |
| `link-token.ts`           | Extrait le jeton d'un lien collé (ou accepte le code seul)                              |
| `pending-registration.ts` | Inscription en attente, en mémoire, pour « Renvoyer l'email »                           |
| `session.ts`              | Après connexion : enregistre les jetons (patients seulement) et choisit l'écran suivant |
| `components/`             | `AuthHeader`, `PasswordChecklist`, `SuccessState`, `FooterLink`, `useCountdown`         |
| `__tests__/auth.test.ts`  | Validation, lien collé, messages d'erreur, décision après connexion                     |

Écrans : `app/(auth)/welcome.tsx`, `sign-up.tsx`, `verify-email.tsx`, `sign-in.tsx`, `forgot-password.tsx`.

## Tester sur un vrai téléphone (Expo Go)

1. Le téléphone et le PC sont sur le **même Wi-Fi**.
2. `pnpm db:up` puis `pnpm dev:api` (l'API écoute sur toutes les interfaces, port 3000).
3. `pnpm --filter @glyka/mobile exec expo start --clear`, puis scanner le QR code.
4. L'app trouve seule l'adresse du PC (`src/lib/config.ts`). Si Windows demande d'autoriser Node.js sur le réseau privé : accepter.
5. Les emails arrivent dans Mailpit : http://localhost:8025 (sur le PC). Copier le lien et le coller dans l'app.

## Règles importantes

- Aucun jeton dans AsyncStorage ni dans les logs ; le mot de passe n'est jamais passé dans l'adresse d'un écran.
- Une feature n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
