# Feature `report` — Rapport « Préparer ma consultation »

**Lot L6 · Fonctionnalité F9**

Le patient choisit la période, voit ce que contiendra le rapport, puis crée le PDF et le partage
(WhatsApp, e-mail, Fichiers, imprimer…). Le PDF est fabriqué par l'API (L6-01, L6-02).

## Tickets

- **L6-03** — Mobile : écran « Préparer ma consultation » et partage du PDF (fait)

## Écran

`app/report/index.tsx`. On y arrive depuis l'onglet « Partager » (« Préparer ma consultation ») et
depuis le bas de l'écran « Analyse ».

- **Période** : 14, 30 ou 90 jours (30 au départ). La liste vient de `@glyka/shared`
  (`REPORT_PERIOD_DAYS`), comme la validation du serveur.
- **Aperçu** : les chiffres de la période calculés sur le téléphone (`AnalysisSummary` de « Analyse »),
  par le même moteur que le serveur. Moins de 10 mesures : le rapport est créé quand même, et l'écran
  prévient qu'il le signalera.
- **Ce que contient le rapport** : les parties du PDF, et le rappel que les notes personnelles n'y sont
  jamais.
- **Créer et partager le PDF** : étapes affichées sous le bouton (« Envoi de vos dernières mesures… »,
  « Création du rapport… », « Ouverture du partage… »). Ensuite : « Partager à nouveau » (même fichier)
  ou « Créer un nouveau rapport ».
- **Le médecin peut aussi le télécharger** : lien vers « Partager mon historique » (case « Rapport PDF »).

## Fichiers

- `report.ts` : la logique, sans interface. `createReport()` enchaîne les étapes ; `filenameOf()`,
  `localFilename()`, `isPdf()`, `reportProblem()`.
- `files.ts` : le PDF rangé dans le cache de l'application (`rapports/`, un seul à la fois) et la feuille
  de partage du système (`expo-file-system`, `expo-sharing`, déjà installés). `files.web.ts` : aperçu
  dans le navigateur (le PDF est téléchargé).
- `useReport.ts` : branche la logique sur le vrai téléphone (réseau, synchronisation, API, fichiers).
- `components/ReportContents.tsx`, `components/ReportEntryCard.tsx`.
- `src/lib/api-client.ts` : `apiFile()` reçoit un fichier avec les mêmes règles que `api()`.

## Règles

- **Chiffres identiques au tableau de bord** : le serveur et le téléphone utilisent le même moteur
  (`@glyka/analytics`) sur les mêmes mesures. Pour cela, **les mesures pas encore envoyées partent
  avant la création du rapport**. Celles qui n'ont pas pu partir sont annoncées : elles ne sont pas dans
  le PDF.
- **Réseau nécessaire** : sans réseau, message immédiat et rien n'est demandé.
- **Nom du fichier** : `afyabora-rapport-AAAA-MM-JJ-30j.pdf`, jamais le nom du patient. Celui du serveur
  est utilisé seulement s'il est sûr (pas de chemin, finit par `.pdf`) ; sinon il est calculé sur le
  téléphone, au même format.
- **Une réponse qui n'est pas un PDF** (ne commence pas par `%PDF-`) est une erreur : rien n'est rangé.
- **Confidentialité** : un seul rapport gardé dans le cache privé de l'application, remplacé au suivant
  et **effacé à la déconnexion**.
- Erreurs expliquées : pas de connexion, trop de rapports en une minute (429), profil médical absent
  (404), partage indisponible sur l'appareil, autre erreur.

## Tests

`__tests__/report.test.ts` (nom du fichier, noms dangereux refusés, PDF reconnu, erreurs, ordre des
étapes, mesures en attente envoyées d'abord, échecs) ; `src/lib/__tests__/api-client.test.ts`
(réception d'un fichier, renouvellement de session, coupure, délai) ; `features/auth/__tests__/session.test.ts`
(rapport effacé à la déconnexion).

```powershell
pnpm --filter @glyka/mobile test -- report api-client session
```

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
