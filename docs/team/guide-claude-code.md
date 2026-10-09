# Guide : travailler avec Claude Code sur Afyabora

## 1. Mise en route (une seule fois)

1. Installer Claude Code (PowerShell, pas CMD) : `irm https://claude.ai/install.ps1 | iex`. Git for Windows est recommandé ; sans lui, Claude Code utilise PowerShell.
2. Ouvrir PowerShell **dans le dossier du projet** et lancer `claude` ; se connecter au compte quand c'est demandé.
3. Choisir le modèle avec `/model`.
4. Vérifier que la mémoire du projet est chargée : `/context` doit lister `CLAUDE.md`. `/memory` permet de la modifier, `/permissions` d'afficher les règles de `.claude/settings.json`.
5. Premier message : copier le texte du §3.

## 2. Qui fait quoi

**Avec Claude Code (code et dépôt)** : implémenter les tickets de l'API (L1-01 à L1-05, L1-13…), les tests, les écrans mobiles et portail, les composants UI, la base locale et la synchronisation, les corrections de CI, les migrations Prisma, la documentation de module, les commits et le titre/description des PR.

**Toi ou l'équipe (décisions, comptes, vérifications humaines)** :

- les réunions : validation des ADR (`docs/team/reunion-adr-L0-09.md`), relecture des schémas (L0-08), maquettes Figma (L7-01, L7-02) ;
- les réglages GitHub : protection de `develop`, labels, jalons, projet Kanban (L0-01), **fusion des PR** (« Squash and merge ») ;
- les comptes et secrets : Expo / EAS (`eas login` est interactif), Firebase, hébergement ; **ne jamais envoyer le contenu de `apps/api/.env` à Claude** ;
- les tests sur téléphone réel et sur le scénario de démo ;
- les décisions de produit que Claude Code te soumet (changement de contrat, dépendance nouvelle, identifiant Android/iOS).

## 3. Quoi lui envoyer : presque rien

Claude Code lit le dépôt lui-même. Il suffit que `CLAUDE.md`, `docs/team/*` et `.claude/` soient **dans le dépôt** (et commités). Copie-colle uniquement ce premier message au début de la première session :

```
Tu reprends le développement du projet Afyabora (nom de code interne : glyka), que je construis avec mon équipe. Avant toute chose :
1. Lis CLAUDE.md, puis docs/team/etat-davancement.md et docs/team/pieges-connus.md.
2. Exécute git status, git branch -vv et git log origin/develop --oneline -15 pour vérifier l'état réel : le fichier d'état peut avoir du retard.
3. Lis le cahier des charges docs/cahier-des-charges/CDC_MVP_Glyka.md (sections 4 à 10), le contrat docs/api/openapi.v0.json et docs/api/REVUE-SCHEMAS.md.
4. Dis-moi en français, en 15 lignes maximum, ce que tu as compris : où on en est, ce qui est fait, ce qui reste, et les trois risques que tu vois. Signale tout écart entre le fichier d'état et la réalité.
5. Ne modifie encore aucun fichier. Propose ensuite un plan pour le prochain ticket et attends mon accord.
Je suis étudiant et je dois pouvoir expliquer chaque ligne à mon équipe : explique simplement, en français, et donne-moi des commandes PowerShell exactes.
```

Ensuite, pour chaque nouveau sujet, il suffit de donner l'identifiant du ticket : `/ticket L1-01`.

Ce que tu colles quand il le faut :

- **une erreur** : le texte brut du terminal (pas une capture d'écran), avec la commande lancée ;
- **une décision de l'équipe** : une phrase (« l'équipe a accepté l'ADR-0004, voici les présents : … »), puis demande-lui de mettre à jour les fichiers.

## 4. La boucle de travail pour chaque ticket

1. `/ticket L1-01` : il lit le ticket, vérifie l'état, te propose un plan. Tu réponds « oui » ou tu corriges.
2. Il code et teste. Tu peux demander `/expliquer apps/api/src/modules/auth` à tout moment.
3. `/verifier` : format, lint, types, tests.
4. `/pr L1-01` : commits, `git push`, titre et description de PR à copier.
5. **Toi** : ouvre la PR sur GitHub, attends les Checks verts, fais relire, **Squash and merge**.
6. `/fin-de-ticket L1-01` : mise à jour de l'état et nettoyage des branches ; il propose le ticket suivant.
   `/etat` fait le point à tout moment (Git, PR, écarts avec la documentation).

## 5. Bonnes pratiques

- **Une session = un ticket.** Utilise `/clear` entre deux tickets, ou `claude -c` pour reprendre la dernière conversation. `/compact` si la session devient longue.
- Lis les différences avant de committer (`git diff`) ; demande-lui d'expliquer ce que tu ne comprends pas : la règle de l'équipe est que tu dois pouvoir défendre chaque ligne.
- Ne le laisse pas faire `git push --force`, `git reset --hard`, `docker compose down -v` ou `prisma migrate reset` : ils sont bloqués ou soumis à ton accord. Les `rebase` après un « squash » se font ensemble, pas tout seul.
- Après avoir modifié `.claude/settings.json`, ouvre une nouvelle session, puis vérifie avec `/permissions`. Les règles « deny » protègent l'outil de lecture de fichiers, pas une commande `cat .env` : la règle dans `CLAUDE.md` (ne jamais lire les secrets) reste nécessaire.
- Tu peux garder des préférences personnelles dans `CLAUDE.local.md` (non commité). Pense à l'ajouter à `.gitignore`.
- Tiens `docs/team/etat-davancement.md` à jour : c'est ce qui permet à une nouvelle session de « savoir où on en est ».

## 6. Premières tâches conseillées

1. Commit de ce dossier de transmission (voir la procédure donnée avec l'archive).
2. `/etat` pour vérifier que tout est cohérent.
3. **L0-09** : réunion d'équipe avec `docs/team/reunion-adr-L0-09.md`, puis demander à Claude Code la PR qui passe les ADR au statut « Accepté ».
4. **L1-01** (`/ticket L1-01`) : inscription patient avec vérification d'email.
5. En parallèle, côté humain : vérifier L0-01 sur GitHub, créer le ticket L5-15 et le ticket de la page portail `/e/:token`, créer le compte Expo pour L0-11.
