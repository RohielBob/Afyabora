# @glyka/portal — portail médecin (React + Vite)

Espace professionnel : le médecin **scanne le QR du patient** et consulte, **pendant une durée limitée**, uniquement ce que le patient a autorisé. **Lecture seule.**

## Démarrer

```bash
cp apps/portal/.env.example apps/portal/.env
pnpm dev:portal          # http://localhost:5173  (l'API doit tourner : pnpm dev:api)
```

## Structure

```
index.html · vite.config.ts · tsconfig.json
src/
├─ main.tsx · router.tsx     # démarrage (thème, session) ; routes et qui peut les ouvrir
├─ routes/                   # UNE page = UN fichier : login, register, verify-email, forgot-password,
│                            #   reset-password, pending, scan, patients, patient-record, expired, not-found
├─ features/                 # auth · scanner · sessions · patient-record · report (README + tickets)
├─ components/               # ui/ (Button, TextField, Checkbox, Alert…), layout/, brand/ (logo)
├─ i18n/                     # TOUS les textes (aucun texte écrit dans les pages) : fr.ts (référence) + 7 langues,
│                            #   index.ts (`texts`, `dateLocale()`, choix de la langue) — voir « Langues »
├─ theme/theme.ts            # jetons @glyka/ui-tokens → variables CSS (thème et accent choisis)
├─ theme/appearance.ts       # choix « Apparence » (Clair/Sombre/Automatique × accent), gardé dans le navigateur
├─ lib/                      # config, client HTTP (jeton d'accès en mémoire, renouvellement unique)
└─ styles/index.css          # Tailwind branché sur les variables du thème, police, animations
```

## Règles

- **Lecture seule** : aucun formulaire d'édition des données patient.
- L'expiration est vérifiée **par le serveur à chaque requête** ; le compte à rebours affiché n'est qu'indicatif.
- À l'expiration ou à la révocation : on **vide les données en mémoire** (cache React Query compris) et on affiche « Accès expiré ».
- Un onglet dont la catégorie n'est pas autorisée n'est pas affiché.
- Aucune donnée patient dans `localStorage`, dans les logs ou l'URL (seul le choix d'apparence y est
  gardé : `glyka.portal.appearance`).
- Responsive : utilisable sur ordinateur, tablette et téléphone.
- **Système de design (ADR-0008)** : mêmes jetons que le mobile (`@glyka/ui-tokens`) : rouge Afyabora
  pour l'action principale, police Plus Jakarta Sans **hébergée avec le portail** (`public/fonts`, licence
  OFL, aucune requête vers Google), menu **« Apparence »** dans l'en-tête de toutes les pages : thème
  Clair (défaut) / Sombre / Automatique (suit l'ordinateur) et accent Rubis / Framboise / Marine /
  Graphite, comme le mobile ; animations modérées désactivées
  si l'ordinateur demande « réduire les animations ». Une page n'utilise que `@/components/ui` et les
  classes du thème (`bg-primary`, `text-muted`, `border-line`…) : **pas de couleur écrite en dur**.
- Session : jeton d'accès en mémoire, session limitée à l'onglet, déconnexion après 30 min
  d'inactivité (détails : `src/features/auth/README.md`).

## Tickets principaux

L1-11 (compte médecin) · L5-10 (scanner) · L5-11 (liste) · L5-12 (dossier) · L5-13 (expiration) · L6-04 (rapport).

**Lots : L1, L5, L6 (partie portail).**

## Langues

Mêmes 8 langues que l'application mobile : français (référence), English, Español, Português, Lingála,
Kiswahili, Kikongo, Tshiluba. Choix dans le menu **« Langue et apparence »** de l'en-tête (le bouton montre
la langue affichée). Par défaut : la langue du navigateur si le portail la connaît, sinon le français.

- Une page lit ses textes dans `texts` (`import { texts, fill } from '@/i18n'`), jamais dans `fr`
  directement, et écrit ses dates avec `toLocaleDateString(dateLocale(), …)`, jamais `'fr-FR'`.
- `dateLocale()` : si le navigateur ne connaît pas la langue (kikongo, tshiluba), dates et nombres en
  français (même règle que le mobile).
- Chaque traduction a le type `Messages` : TypeScript refuse un texte manquant ou en trop. Les tests
  (`src/i18n/__tests__/languages.test.ts`) vérifient aussi les `{{variables}}`, la longueur des listes,
  les textes vides, les caractères invisibles et les lettres ɛ/ɔ.
- Au changement de langue, tout le portail est redessiné (`src/main.tsx`) ; la session et les données
  déjà chargées sont gardées.
- Restent en français : les phrases des observations d'analyse (écrites par le serveur), le rapport PDF
  et les emails. Le menu le dit.
- Toutes les langues sauf le français et l'anglais sont marquées « traduction en relecture »
  (`reviewed: false` dans `src/i18n/languages.ts`) jusqu'à la relecture par une personne qui parle la
  langue, en commençant par les textes médicaux (`record`, `emergency`, `scan`).
