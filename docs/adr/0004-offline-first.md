# ADR-0004 — Application mobile local-first (saisie hors-ligne et synchronisation)

- **Statut :** Proposé (à valider en réunion, ticket L8-01)
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
- Chiffrement de la base locale (SQLCipher) à valider (ticket L8-02) ; nécessite un development build.
- L'horloge de l'appareil peut dériver : le serveur rejette une `measuredAt` à plus de 5 minutes dans le futur.
