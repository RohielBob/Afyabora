# Feature `sharing` — Partage par QR dynamique

**Lot L5 · Fonctionnalité F7**

Choix catégories/durée, QR rotatif, suivi en direct, révocation, journal d'accès.

## Tickets

- **L5-06** — Mobile : choix des catégories à partager et de la durée
- **L5-07** — Mobile : écran QR avec compte à rebours de rotation
- **L5-08** — Mobile : suivi en direct (« Dr X consulte », minuteur, bouton Mettre fin)
- **L5-09** — Mobile : écran « Qui a consulté mes données »

## Fait

### L5-06 — choix des catégories et de la durée

- **Onglet « Partager »** (`app/(tabs)/share.tsx`) : trois promesses (aucune donnée dans le QR, accès
  limité, le patient garde la main), bouton **« Partager mon historique »**, « le partage nécessite une
  connexion internet », liens vers « Qui a consulté mes données » (L5-09) et la carte d'urgence (L6-06).
- **Écran du choix** (`app/share/new.tsx`) :
  - 7 catégories en cartes cochables (icône, libellé, ce que le médecin verra). Cochées au départ :
    historique glycémique, traitements, repas, activité, résumé des analyses. **Décochées** : notes
    personnelles (CDC F7) et téléchargement du rapport. Cocher les notes affiche une mise en garde ;
  - compteur « 5 sur 7 » ; rien de coché ⇒ bouton inactif et explication ;
  - 4 durées (5 min, 30 min par défaut, 1 h, Consultation 2 h au plus) ; « la durée commence au scan » ;
  - **« Générer le QR »** ⇒ `POST /shares` puis l'écran du QR (L5-07). Sans réseau : message immédiat,
    rien n'est envoyé. 429, 503, profil manquant (message du serveur), autre erreur : message clair et
    « Réessayer » quand c'est utile.
- `choice.ts` (règles pures : ordre, cases par défaut, cocher/décocher, corps de la requête, erreurs),
  `api.ts` (`sharingApi.create`, réponse vérifiée par `createShareResponseSchema`), `flow.ts` (partage
  en cours, **en mémoire seulement** : le jeton n'est jamais écrit sur le téléphone),
  `components/CategoryOption.tsx`.
- Accessibilité : chaque carte est une case à cocher pour le lecteur d'écran (`aria-checked` ajouté : sur
  le web, `accessibilityState` ne le produit pas). Textes en français et en anglais (`share.*`).
- Tests : `__tests__/choice.test.ts`.

## Fichiers prévus

- `RotatingQr.tsx` : renouvelle le jeton toutes les 60 s (L5-07)
- `useShareStatus.ts` : suivi (polling/SSE) (L5-08)

## Règle importante

Nécessite le réseau. Le QR ne contient jamais de donnée médicale, seulement un jeton opaque.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
