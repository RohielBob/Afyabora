# Pièges connus (déjà rencontrés — ne pas les refaire)

## Windows, PowerShell, disques

- Dans une commande entre **guillemets doubles**, PowerShell interprète `$?`, `$PWD`, etc. : utiliser des apostrophes simples pour `sh -c '…'`.
- Écrire un fichier avec `Set-Content -Encoding utf8` (Windows PowerShell 5) ajoute un **BOM** qui casse certains fichiers (`.gitattributes`, `.env`). Préférer `[System.IO.File]::WriteAllText(chemin, texte, (New-Object System.Text.UTF8Encoding $false))` ou l'éditeur.
- Le projet est sur le disque externe **E:** ; Docker et pnpm utilisent **C:**. Garder **au moins 15 Go libres sur C:** : un disque presque plein a produit des fichiers compilés de 0 octet dans l'image Docker (API qui s'arrête avec le code 0, sans message).
- Magasin pnpm : `E:\.pnpm-store\v3` (`pnpm config set store-dir "E:\.pnpm-store\v3" --global`). Ne pas le changer : sinon pnpm refuse de travailler sur les `node_modules` existants.

## Git

- Les fusions sont des **squash** : les branches construites sur une autre branche doivent être déplacées avec `git rebase --onto origin/develop <ancienne-base> <branche>`, puis `git push --force-with-lease` (accord de l'utilisateur).
- commitlint refuse un sujet qui commence par une majuscule ou en « Sentence case » (`subject-case`) ; un scope hors liste n'est qu'un avertissement.
- Toujours `git status` avant `git add` : un `add` sur un fichier inexistant fait échouer silencieusement le commit suivant (déjà arrivé avec `.gitattributes`).
- `.gitattributes` impose `eol=lf` ; sous Windows, Git affiche « LF will be replaced by CRLF » : sans gravité.
- Husky sauvegarde l'état dans un « git stash » pendant un commit : normal.

## CI et versions

- La CI tourne sur un ordinateur **vierge** : tout ce qui est généré localement doit être généré par une étape de la CI. Exemple : le **client Prisma** n'est pas créé par `pnpm install` (étape `prisma generate` ajoutée dans `ci.yml`).
- **Node 20** partout : `node --experimental-strip-types` n'existe pas ; les scripts de test utilisent `tsx` (`node --import tsx --test fichier.test.ts`, sans joker : Windows ne développe pas `*`).
- `pnpm test` / `typecheck` via turbo s'arrêtent au premier échec : utiliser `pnpm exec turbo run test typecheck build --continue` pour voir tout.
- `eslint` 9.39.x est « deprecated » et `pnpm` annonce une version 12 : ignorer, ne pas migrer en pleine livraison.
- Le workflow Docker (`docker.yml`) dure 8 à 10 minutes.

## Mobile / Expo

- Expo Go **n'affiche pas** la nouvelle icône ni l'écran de lancement ; il faut un build. Le push et le chiffrement SQLite exigent un **development build** (L0-11).
- Metro lit `@glyka/*` dans `dist/` : après une modification de `packages/ui-tokens` (ou `shared`, `analytics`), reconstruire ce paquet, sinon écran blanc ou erreur « Unable to resolve ».
- **Sur le disque externe `E:`, Metro ne voit pas toujours les fichiers modifiés** après son démarrage : l'aperçu web continue d'afficher l'ancienne version (même après un rechargement de la page). Constaté trois fois le 2026-10-11 (une démo temporaire déjà retirée du disque restait affichée ; L9-04). Remède : **arrêter puis relancer** `expo start` (ou `expo start --clear`). Pour vérifier ce que Metro sert vraiment, dans la console du navigateur : chercher le module par son chemin dans `__r.getModules()` (`verboseName`) et lire `String(module.factory)`.
- `app/index.tsx` choisit le premier écran selon la session (L1-07) : accueil, connexion, assistant de profil ou onglets.
- `expo install --fix` aligne les versions natives sur le SDK : ne pas mettre `react-native` à jour à la main.
- Ne jamais comparer des dates SQLite en texte si les décalages horaires diffèrent (`+01:00` vs `Z`) : normaliser en UTC à l'écriture.

- **Écrans protégés** (`Stack.Protected`) : quand un écran est refusé, Expo Router revient à l'écran « ancre » de la pile. Sans `export const unstable_settings = { anchor: 'index' }` dans `app/_layout.tsx`, il prend le premier écran par ordre alphabétique (ex. `forgot-password`) : comportement incohérent.
- **expo-sqlite sur le web** : l'ouverture de la base peut rester bloquée sans erreur (le navigateur exige des en-têtes de sécurité que le serveur de dev ne fournit pas). Les accès à la base locale passent par `src/db/reset.ts` (ignorés sur le web, limite de temps sur téléphone) : un bouton ne doit jamais attendre une base qui ne répond pas.
- **Clés React en double** (`key`) entre éléments voisins : React garde un « fantôme » de l'ancien élément (vu avec deux en-têtes affichés en même temps). Deux voisins ne partagent jamais la même `key`.
- **Clavier fermé tout seul dans l'aperçu web** : sur le web, un `ScrollView` avec `keyboardDismissMode="on-drag"` (notre `Screen`) ferme le clavier à **chaque** défilement, même quand la page rapetisse (ex. une carte qui disparaît). Sur téléphone, seul un glissement du doigt le ferme : ne pas « corriger » `Screen` pour l'aperçu (vu avec « Corriger la valeur », L2-04).
- **L'aperçu web ne remplace pas un vrai téléphone Android** (2026-10-20). Deux bugs invisibles dans le navigateur
  rendaient l'APK inutilisable :
  - **`Intl.PluralRules` n'existe pas sur Android (moteur Hermes)** : i18next affichait le NOM des textes au
    pluriel (« dashboard.chart.period »). Corrigé par `src/i18n/intl-polyfill.ts` (règles CLDR de nos 8
    langues), importé en premier dans `src/i18n/index.ts`. Ne pas le retirer ; une nouvelle langue doit y
    ajouter ses règles (le test `intl-polyfill.test.ts` le vérifie en retirant `Intl.PluralRules`). La
    bibliothèque `@formatjs/intl-pluralrules` ne suffit pas seule : sur Hermes, elle demande aussi
    `Intl.Locale`.
  - **Un composant passé à `refreshControl` doit transmettre `children` et `style`** : sur Android, React
    Native place la LISTE DANS l'indicateur. `PullToRefresh` les ignorait : Accueil, Historique,
    Synchronisation et journal d'accès étaient entièrement vides.

  Vérifier chaque ticket mobile aussi sur un téléphone : `adb` (platform-tools de Google) + Expo Go branché en
  USB (`adb reverse tcp:8081 tcp:8081`, puis `exp://127.0.0.1:8081`), journal filtré sur `ReactNativeJS`.

## API / base de données

- **Paquets partagés compilés** : l'API, le mobile et le portail lisent `@glyka/shared`, `@glyka/analytics` et `@glyka/ui-tokens` dans leur dossier `dist/`. Après un `git switch` ou un `git pull` qui modifie un de ces paquets, le recompiler (`pnpm --filter @glyka/shared build`, etc.) ou passer par `pnpm test` / `pnpm typecheck` (turbo recompile tout seul). Les **tests de l'API** lisent directement le code source de `@glyka/shared` (alias dans `apps/api/vitest.config.ts`) : ils ne peuvent plus tester un ancien schéma.
- `nest build` lit `tsconfig.build.json` (déclaré dans `nest-cli.json`) : sans lui, le dossier `dist` contient `src/` et `test/` et `node dist/main.js` ne trouve rien.
- Dans Docker, `localhost` est le conteneur lui-même : `docker-compose.yml` surcharge `DATABASE_URL` (`@db:5432`) et `SMTP_HOST` (`mailpit`).
- `docker compose down` **sans `-v`** : `-v` supprime la base locale. `prisma migrate reset` aussi efface tout (dev uniquement, sur accord).
- Les tests de l'API (Vitest + SWC pour les décorateurs) utilisent un **faux Prisma** et un vrai serveur HTTP sur le port 0 (`fetch` sur 127.0.0.1) : aucune base nécessaire.
- Une migration déjà fusionnée dans `develop` ne se modifie **jamais** : on en crée une nouvelle.
- **Windows : `prisma generate` échoue avec `EPERM … query_engine-windows.dll.node`** quand l'API tourne
  (`pnpm dev:api`) : le fichier du moteur est verrouillé. Les types du client sont quand même régénérés par
  `prisma migrate dev` ; sinon, arrêter l'API, relancer `pnpm --filter @glyka/api prisma:generate`, redémarrer
  (L3-10).
- Générer une migration **sans l'appliquer** pour relire le SQL d'abord :
  `pnpm --filter @glyka/api exec prisma migrate dev --create-only --name <nom>`, puis `prisma migrate dev`.
- **Jamais « lire puis réécrire » un compteur ou un état partagé** (échecs de connexion, quotas, stock…) :
  des requêtes simultanées lisent la même valeur et s'écrasent. Faire faire le calcul par la base
  (`updateMany` avec condition, `{ increment: 1 }`) ou une consommation atomique (`updateMany` dont on
  vérifie `count`). Trouvé en L1-13 : 5 essais simultanés ne verrouillaient pas le compte.
- Un test de « requêtes simultanées » par HTTP dans le même processus ne reproduit pas toujours l'ordre
  dangereux : pour un ordre précis, ajouter un point d'arrêt dans le faux Prisma (voir
  `test/auth-security.test.ts`, `beforeRefreshCreate`), et vérifier que le test ÉCHOUE sur l'ancien code.
- Les fichiers `docs/api/openapi.v0.json` (contrat) et `openapi.generated.json` (export Nest) sont ignorés par Prettier ; ce dernier est aussi ignoré par Git.
- **Prettier lit l'en-tête `---` d'un fichier Markdown comme du YAML** et peut réécrire son texte (« Libellé : x »
  devient « Libellé: x »). Les fiches de l'assistant (`apps/api/knowledge/fiches/`) sont donc exclues de
  Prettier : leur texte relu par le médecin est protégé par une empreinte (L9-02).
- Une séquence d'échappement Unicode (comme celle de l'indicateur d'ordre des octets, U+FEFF) écrite par l'outil
  d'écriture de Claude Code peut devenir le caractère lui-même, invisible dans le code. Vérifier les nouveaux
  fichiers (caractères Unicode de catégorie Cf ou Mn) et réécrire en séquence échappée (L3-07, L9-02).
