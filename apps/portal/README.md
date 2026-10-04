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
├─ main.tsx · router.tsx     # démarrage, routes (provisoires : Stub)
├─ routes/                   # UNE page = UN fichier : login, register, pending, scan, patients, patient-record, expired
├─ features/                 # auth · scanner · sessions · patient-record · report (README + tickets)
├─ components/               # composants partagés (Stub provisoire)
├─ lib/                      # config, client HTTP
└─ styles/index.css          # Tailwind + jetons de l'identité Glyka
```

## Règles
- **Lecture seule** : aucun formulaire d'édition des données patient.
- L'expiration est vérifiée **par le serveur à chaque requête** ; le compte à rebours affiché n'est qu'indicatif.
- À l'expiration ou à la révocation : on **vide les données en mémoire** (cache React Query compris) et on affiche « Accès expiré ».
- Un onglet dont la catégorie n'est pas autorisée n'est pas affiché.
- Aucune donnée patient dans `localStorage`, dans les logs ou l'URL.
- Responsive : utilisable sur ordinateur et tablette ; identité visuelle alignée sur `@glyka/ui-tokens`.

## Tickets principaux
L1-11 (compte médecin) · L5-10 (scanner) · L5-11 (liste) · L5-12 (dossier) · L5-13 (expiration) · L6-04 (rapport).

**Lots : L1, L5, L6 (partie portail).**
