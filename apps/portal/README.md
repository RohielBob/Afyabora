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
├─ i18n/fr.ts                # TOUS les textes du portail (aucun texte écrit dans les pages)
├─ theme/theme.ts            # jetons @glyka/ui-tokens → variables CSS (clair + sombre)
├─ lib/                      # config, client HTTP (jeton d'accès en mémoire, renouvellement unique)
└─ styles/index.css          # Tailwind branché sur les variables du thème, police, animations
```

## Règles

- **Lecture seule** : aucun formulaire d'édition des données patient.
- L'expiration est vérifiée **par le serveur à chaque requête** ; le compte à rebours affiché n'est qu'indicatif.
- À l'expiration ou à la révocation : on **vide les données en mémoire** (cache React Query compris) et on affiche « Accès expiré ».
- Un onglet dont la catégorie n'est pas autorisée n'est pas affiché.
- Aucune donnée patient dans `localStorage`, dans les logs ou l'URL.
- Responsive : utilisable sur ordinateur, tablette et téléphone.
- **Système de design (ADR-0008)** : mêmes jetons que le mobile (`@glyka/ui-tokens`) : rouge Afyabora
  pour l'action principale, police Plus Jakarta Sans **hébergée avec le portail** (`public/fonts`, licence
  OFL, aucune requête vers Google), clair / sombre selon l'ordinateur, animations modérées désactivées
  si l'ordinateur demande « réduire les animations ». Une page n'utilise que `@/components/ui` et les
  classes du thème (`bg-primary`, `text-muted`, `border-line`…) : **pas de couleur écrite en dur**.
- Session : jeton d'accès en mémoire, session limitée à l'onglet, déconnexion après 30 min
  d'inactivité (détails : `src/features/auth/README.md`).

## Tickets principaux

L1-11 (compte médecin) · L5-10 (scanner) · L5-11 (liste) · L5-12 (dossier) · L5-13 (expiration) · L6-04 (rapport).

**Lots : L1, L5, L6 (partie portail).**
