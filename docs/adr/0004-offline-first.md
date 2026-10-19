# ADR-0004 — Application mobile local-first (saisie hors-ligne et synchronisation)

- **Statut :** Accepté avec modifications — réunion du 2026-10-09 (tickets L0-09 et L8-01)
- **Date :** 2026-10-04

## Contexte

La saisie hors-ligne est une exigence validée du MVP : le patient enregistre ses mesures sans réseau, et elles rejoignent la base de données à la reconnexion. La connectivité peut être irrégulière.

## Décision

Le téléphone possède une **base SQLite locale**, source de vérité pour l'affichage.

- Toute écriture (mesure, événement) va **d'abord en local** et empile une opération dans une **outbox**, **dans la même transaction**.
- Les identifiants sont des **UUID générés sur l'appareil** : rejouer une opération ne crée jamais de doublon.
- `POST /sync/push` envoie les opérations (≤ 200) ; chaque opération a un `opId` traité **une seule fois** par le serveur (idempotence).
- `GET /sync/pull?cursor=…` ramène les changements du serveur (curseur stable `updatedAt, id`), **suppressions incluses** (tombstones).
- **Conflits :** la dernière écriture gagne (`clientUpdatedAt`). Un seul appareil actif par patient est le cas nominal, donc les conflits sont rares.
- Le tableau de bord et l'analyse lisent la base locale : `@glyka/analytics` s'exécute **sur le téléphone**.

## Hors-ligne / en ligne

| Fonctionne hors-ligne                                                                                           | Exige le réseau                                                                              |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Saisie, modification, suppression, tableau de bord, chronologie, analyse (gabarits), rappels et alertes locales | Inscription / connexion, import, partage QR, rapport PDF, carte d'urgence, question libre IA |

## Alternatives étudiées

| Option                                        | Avantages     | Inconvénients                                               |
| --------------------------------------------- | ------------- | ----------------------------------------------------------- |
| « Réseau d'abord » avec simple file d'attente | Plus simple   | Le tableau de bord dépend du réseau ; saisie fragile        |
| Bibliothèque de synchronisation clé en main   | Moins de code | Dépendance lourde, moins de contrôle, difficile à expliquer |

## Conséquences

- **L'architecture mobile doit être local-first dès le jour 2** : impossible de la « greffer » à la fin.
- Complexité supplémentaire (outbox, curseur, tombstones, tests de conflits) : lot L8, ticket XL L8-06 à découper.
- Chiffrement de la base locale : **décidé et fait (L8-02, 2026-10-19)** : SQLCipher (AES-256) avec une clé aléatoire de 32 octets dans SecureStore ; refus d'enregistrer en clair dans l'APK final ; sauvegarde Android désactivée. Détails : `apps/mobile/src/db/README.md`. Nécessite un APK (EAS) : Expo Go n'a pas SQLCipher.
- L'horloge de l'appareil peut dériver : le serveur rejette une `measuredAt` à plus de 5 minutes dans le futur.

## Modifications décidées à l'acceptation (réunion du 2026-10-09, L8-01)

Huit points relevés à l'audit du dépôt ; chacun est rattaché au ticket qui doit l'appliquer.

1. **Une opération invalide ne bloque pas le lot (L8-04).** Le serveur valide d'abord l'enveloppe (`deviceId`, tableau de 200 éléments maximum), puis **chaque opération séparément** avec `syncOpSchema` : une opération invalide reçoit `REJECTED` + raison, les autres sont appliquées. Valider tout le corps d'un coup avec `syncPushRequestSchema` est interdit pour cette route (une seule erreur renverrait 400 pour tout le lot).
2. **Dates en UTC (L8-03, L8-04).** Toute date écrite en base locale ou envoyée au serveur est normalisée en UTC (suffixe `Z`) **au moment de l'écriture**. Les comparaisons de dates se font sur des `Date`, jamais sur du texte.
3. **Un téléphone, un compte à la fois (L1-07, L8-02).** À la déconnexion, l'app tente d'envoyer l'outbox, prévient s'il reste des opérations non envoyées, puis **vide la base locale**. Un nouveau compte ne voit jamais les données du précédent.
4. **Curseur de pull sans trou (L8-05).** Le curseur `(updatedAt, id)` peut sauter une ligne écrite par une transaction lente. Le pull relit donc une **marge de recouvrement** (quelques secondes avant le curseur) ; le mobile applique les changements de façon idempotente. Si la marge se révèle insuffisante, on passe à un numéro de version croissant (nouvelle migration).
5. **« La dernière écriture gagne » (L8-04).** Accepté pour le MVP (un seul appareil actif). Le serveur rejette aussi un `clientUpdatedAt` à plus de 5 minutes dans le futur, pour qu'une horloge déréglée ne gagne pas tous les conflits.
6. **Session hors-ligne (L1-07, L8-06).** Un jeton d'accès expiré n'empêche pas d'utiliser l'app hors-ligne. Au retour du réseau, l'app rafraîchit la session ; si le refresh a expiré, elle redemande la connexion **sans effacer l'outbox** du même compte.
7. **Le pull n'écrase pas une modification locale en attente (L8-06).** Une ligne locale `pending_sync = 1` n'est pas remplacée par la version du serveur avant que son opération ait été envoyée.
8. **Development build (L0-11).** Le chiffrement de la base locale et le push exigent un development build, donc un compte Expo. L'identifiant `com.glyka.app` devient définitif au premier build publié (ADR-0007) : **à trancher avant le premier build EAS**.
