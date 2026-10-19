# @glyka/mobile — application patient (Expo / React Native)

App Android (prioritaire) et iOS : suivi de glycémie, **saisie hors-ligne**, import, analyse, **partage par QR dynamique**, carte d'urgence, **notifications**.

## Principe d'architecture : local-first (ADR-0004)

```
Écran ──► repository local (SQLite) ──► outbox ──► moteur de sync ──► API (/sync/push, /sync/pull)
   ▲                 │
   └── lecture ──────┘   Le tableau de bord et l'analyse lisent la base LOCALE (@glyka/analytics tourne sur le téléphone).
```

- **On n'écrit jamais directement sur l'API** pour une mesure ou un événement : écriture locale + opération dans l'`outbox` (même transaction), puis synchronisation dès que le réseau est là.
- L'identifiant (UUID) est généré sur le téléphone : rejouer une opération ne crée jamais de doublon.
- Fonctionnent **hors-ligne** : saisie, tableau de bord, chronologie, analyse (gabarits), rappels et alertes locales.
- Nécessitent le **réseau** : inscription/connexion, import, partage QR, rapport PDF, carte d'urgence, question libre IA.

## Démarrer

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
cd apps/mobile && npx expo install --fix     # aligne les versions Expo/React Native (ticket L0-02)
pnpm dev:mobile                               # Expo
```

> **APK Android (L0-11)** : `npx eas-cli@latest build --platform android --profile preview` (dans `apps/mobile`),
> branché sur l'API hébergée. Guide pas à pas : [`docs/deploy/apk-android.md`](../../docs/deploy/apk-android.md).
> Les notifications push et le chiffrement SQLite (L8) demanderont aussi un APK, pas Expo Go.

## Structure

```
app/                     Routes (expo-router) — UN fichier = UN écran = un ticket (voir ScreenStub)
├─ (auth)/               bienvenue, inscription, vérification, connexion, mot de passe oublié
├─ (onboarding)/         assistant de profil
├─ (tabs)/               Accueil · Chronologie · Analyse · Partager · Profil
├─ measurement/ event/   saisie (modales)
├─ import/ share/ report/ emergency/ insights/ settings/
src/
├─ features/             UN dossier par fonctionnalité (README + tickets) : auth, profile, measurements, events,
│                        dashboard, timeline, imports, insights, sharing, report, emergency, notifications, sync
├─ db/                   SQLite locale : schema.ts (migrations), client.ts, repositories/ (mesures, outbox)
├─ components/ui/        Design system : Text, Button, Card, Screen, RangeBadge (✓ réels), ScreenStub (provisoire)
├─ theme/                Couleurs/typo/espacements depuis @glyka/ui-tokens (mode clair/sombre)
├─ i18n/                 Textes fr (défaut) / en — jamais de texte en dur dans les écrans
├─ lib/                  config, client HTTP, stockage sécurisé (jetons), génération d'UUID
└─ providers/            React Query, i18n (+ démarrage de la synchronisation)
```

## Règles

- Textes via `i18n` ; couleurs/espacements via `theme` ; **un état glycémique = couleur + symbole + libellé** (`RangeBadge`).
- Cibles tactiles ≥ 48 px, tailles de police adaptables.
- Jetons uniquement dans **SecureStore**. Aucune donnée de santé dans les logs.
- Une feature n'importe pas le code interne d'une autre : elle passe par son `index.ts`.
- Notifications : **aucune valeur de santé** dans le texte par défaut.

## Déjà en place

Config Expo/EAS, schéma SQLite v1 + migrations, repository des mesures avec outbox atomique, `coalesceOps` (testé), détection réseau, composants UI de base, i18n, navigation complète en écrans provisoires.

## Tests

`pnpm --filter @glyka/mobile test` (jest-expo). Premier test : `src/features/sync/__tests__/coalesce.test.ts`.

**Lots : L1, L2, L3, L4, L5, L6, L8 (partie mobile) · L7 (composants).**
