# Feature `auth` — Comptes et sessions côté téléphone

**Lot L1 · Fonctionnalité F1**

Écrans d'authentification, session, jetons dans SecureStore, verrouillage biométrique.

## Tickets
- **L1-06** — Mobile : écrans bienvenue, inscription, vérification email, connexion, mot de passe oublié
- **L1-07** — Mobile : stockage sécurisé des jetons et rafraîchissement automatique de session
- **L1-09** — Mobile : verrouillage de l'app par biométrie ou code
- **L1-10** — Mobile : consentement explicite et avertissement « outil d'aide, pas un avis médical »

## Fichiers prévus
- `api.ts` : appels /auth/*
- `session.ts` : état de session, rafraîchissement du jeton
- `biometrics.ts` : expo-local-authentication

## Règle importante
Aucun jeton dans AsyncStorage ni dans les logs.

## Organisation
Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
