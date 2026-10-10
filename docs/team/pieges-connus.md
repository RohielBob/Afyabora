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
- `app/index.tsx` est seulement une redirection vers `/(auth)/welcome` (une page statique à cet endroit masquait tous les écrans et ses « boutons » n'étaient que des `View`).
- `expo install --fix` aligne les versions natives sur le SDK : ne pas mettre `react-native` à jour à la main.
- Ne jamais comparer des dates SQLite en texte si les décalages horaires diffèrent (`+01:00` vs `Z`) : normaliser en UTC à l'écriture.

## API / base de données

- **Paquets partagés compilés** : l'API, le mobile et le portail lisent `@glyka/shared`, `@glyka/analytics` et `@glyka/ui-tokens` dans leur dossier `dist/`. Après un `git switch` ou un `git pull` qui modifie un de ces paquets, le recompiler (`pnpm --filter @glyka/shared build`, etc.) ou passer par `pnpm test` / `pnpm typecheck` (turbo recompile tout seul). Les **tests de l'API** lisent directement le code source de `@glyka/shared` (alias dans `apps/api/vitest.config.ts`) : ils ne peuvent plus tester un ancien schéma.
- `nest build` lit `tsconfig.build.json` (déclaré dans `nest-cli.json`) : sans lui, le dossier `dist` contient `src/` et `test/` et `node dist/main.js` ne trouve rien.
- Dans Docker, `localhost` est le conteneur lui-même : `docker-compose.yml` surcharge `DATABASE_URL` (`@db:5432`) et `SMTP_HOST` (`mailpit`).
- `docker compose down` **sans `-v`** : `-v` supprime la base locale. `prisma migrate reset` aussi efface tout (dev uniquement, sur accord).
- Les tests de l'API (Vitest + SWC pour les décorateurs) utilisent un **faux Prisma** et un vrai serveur HTTP sur le port 0 (`fetch` sur 127.0.0.1) : aucune base nécessaire.
- Une migration déjà fusionnée dans `develop` ne se modifie **jamais** : on en crée une nouvelle.
- Les fichiers `docs/api/openapi.v0.json` (contrat) et `openapi.generated.json` (export Nest) sont ignorés par Prettier ; ce dernier est aussi ignoré par Git.
