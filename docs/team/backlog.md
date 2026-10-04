# Backlog du MVP

Source de vérité : `backlog.csv` (importable dans GitHub Projects ; `scripts/github/create-issues.sh` crée les issues).
Tailles : S ≤ 2 h · M ½ journée · L 1 journée · XL à découper avant de commencer.

**105 tickets** · P0 : 97 · P1 : 8

| Lot | Intitulé | Tickets |
|---|---|---|
| L0 | Socle | 11 |
| L1 | Auth & profil | 14 |
| L2 | Mesures & tableau de bord | 12 |
| L3 | Analyse | 10 |
| L4 | Import | 9 |
| L5 | Partage & portail médecin | 14 |
| L6 | Rapport & urgence | 6 |
| L7 | Design & contenu | 12 |
| L8 | Hors-ligne & notifications | 17 |

## L0 — Socle

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L0-01 | Initialiser le dépôt GitHub : protéger main/develop, créer labels, projet Kanban, jalons J1 à J10 | — | P0 | J1 | S | — |
| L0-02 | Lancer pnpm install, aligner les versions (expo install --fix) et vérifier que tout démarre | — | P0 | J1 | M | — |
| L0-03 | Configurer ESLint (typescript-eslint, react-hooks), Prettier, Husky et commitlint | — | P0 | J1 | M | L0-02 |
| L0-04 | Route GET /health + test + CI verte | — | P0 | J1 | S | L0-02 |
| L0-05 | Valider docker compose (db, mailpit) et le Dockerfile de l'API | — | P0 | J1 | M | L0-02 |
| L0-06 | Migrer le schéma Prisma initial et documenter la procédure de migration | — | P0 | J1 | M | L0-05 |
| L0-07 | Contrat OpenAPI v0 : exporter, geler et publier dans docs/api | — | P0 | J1 | M | L0-06 |
| L0-08 | Relecture des schémas Zod partagés avec les responsables de lot | — | P0 | J1 | M | — |
| L0-09 | Relire et accepter les ADR 0001 à 0006 | — | P0 | J1 | S | — |
| L0-10 | Déployer l'API et le portail sur un environnement de test partagé | — | P1 | J5 | L | L0-04 |
| L0-11 | Construire l'APK « development build » avec EAS (nécessaire au push et au chiffrement SQLite) | F11/F12 | P0 | J2 | L | L0-02 |

## L1 — Auth & profil

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L1-01 | API : inscription patient + email de vérification (Mailpit) | F1 | P0 | J2 | L | L0-06 |
| L1-02 | API : connexion, refresh rotatif, déconnexion, verrouillage après 5 échecs | F1 | P0 | J2 | L | L1-01 |
| L1-03 | API : mot de passe oublié et réinitialisation | F1 | P0 | J2 | M | L1-01 |
| L1-04 | API : garde JWT global, rôles, tests d'autorisation | F1 | P0 | J2 | M | L1-02 |
| L1-05 | API : profil patient et seuils d'alerte (validation Zod) | F1 | P0 | J2 | M | L1-04 |
| L1-06 | Mobile : écrans bienvenue, inscription, vérification email, connexion, mot de passe oublié | F1 | P0 | J2 | L | L1-01 |
| L1-07 | Mobile : stockage sécurisé des jetons et rafraîchissement automatique de session | F1 | P0 | J2 | M | L1-02 |
| L1-08 | Mobile : assistant de profil en 3 étapes | F1 | P0 | J3 | M | L1-05 |
| L1-09 | Mobile : verrouillage de l'app par biométrie ou code | F1 | P0 | J3 | M | L1-07 |
| L1-10 | Mobile : consentement explicite et avertissement « outil d'aide, pas un avis médical » | F1 | P0 | J2 | S | L1-06 |
| L1-11 | Portail : inscription et connexion médecin, page « compte en attente » | F8 | P0 | J3 | L | L1-02 |
| L1-12 | Script d'administration : approuver un compte médecin | F8 | P0 | J3 | S | L1-01 |
| L1-13 | Tests auth : email non vérifié, verrouillage, rotation et réutilisation du refresh | F1 | P0 | J3 | M | L1-02 |
| L1-14 | API : export des données et suppression du compte | F1 | P1 | J9 | M | L1-05 |

## L2 — Mesures & tableau de bord

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L2-01 | API : mesures CRUD idempotent (UUID client), conversion mg/dL, tombstones | F2 | P0 | J3 | L | L1-04 |
| L2-02 | API : événements (repas, activité, traitement déclaré) | F4 | P0 | J4 | M | L2-01 |
| L2-03 | Mobile : saisie rapide d'une mesure (valeur, unité, date, contexte), écriture locale d'abord | F2 | P0 | J3 | L | L8-03 |
| L2-04 | Mobile : confirmation de valeur inhabituelle + message de sécurité hypo/hyper | F2 | P0 | J3 | M | L2-03 |
| L2-05 | Mobile : tableau de bord — dernière mesure et badge d'état (forme + libellé + couleur) | F3 | P0 | J3 | M | L7-05 |
| L2-06 | Mobile : graphique d'évolution 7/14/30/90 jours avec bande cible | F3 | P0 | J4 | L | L2-05 |
| L2-07 | Mobile : statistiques et comparaison avec la période précédente | F3 | P0 | J4 | M | L8-11 |
| L2-08 | Mobile : score de qualité des données et phrase d'explication | F3 | P0 | J4 | M | L8-11 |
| L2-09 | Mobile : chronologie (groupée par jour, filtres, badges de provenance) | F4 | P0 | J4 | L | L8-03 |
| L2-10 | Mobile : ajout rapide d'un repas, d'une activité, d'un traitement déclaré | F4 | P0 | J4 | M | L8-03 |
| L2-11 | Mobile : modification et suppression d'une mesure | F2 | P0 | J4 | M | L2-03 |
| L2-12 | Tests API mesures : idempotence, conversions, bornes plausibles, date future | F2 | P0 | J4 | M | L2-01 |

## L3 — Analyse

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L3-01 | Étendre les tests d'analytics avec un jeu de données de référence validé | F6 | P0 | J3 | M | — |
| L3-02 | Prendre en compte le fuseau horaire du patient (créneaux, jours) | F6 | P0 | J4 | M | L3-01 |
| L3-03 | API : /insights et /quality branchées sur @glyka/analytics | F6 | P0 | J5 | M | L2-01 |
| L3-04 | Mobile : écran Analyse avec « Voir les mesures concernées » | F6 | P0 | J5 | L | L8-11 |
| L3-05 | API : interface LlmProvider, implémentation, repli automatique sur les gabarits | F6 | P0 | J7 | L | L3-03 |
| L3-06 | Résumé automatique (IA-3) avec garde-fous | F6 | P0 | J7 | L | L3-05 |
| L3-07 | Jeu de questions-pièges et test automatique des garde-fous | F6 | P0 | J7 | M | L3-05 |
| L3-08 | Question libre sur l'historique (IA-4) | F6 | P1 | J8 | L | L3-06 |
| L3-09 | Mobile : analyse et gabarits calculés hors-ligne depuis la base locale | F6 | P0 | J5 | M | L8-11 |
| L3-10 | Journaliser les réponses du modèle de langage pour audit | F6 | P0 | J7 | S | L3-05 |

## L4 — Import

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L4-01 | Analyseur CSV : séparateurs, virgule/point décimal, encodages UTF-8 et Windows-1252 | F5 | P0 | J4 | L | L0-08 |
| L4-02 | Analyseur XLSX | F5 | P0 | J4 | M | L4-01 |
| L4-03 | Règles de validation (VALID, DUPLICATE, INCONSISTENT, ERROR) avec tests | F5 | P0 | J4 | L | L4-01 |
| L4-04 | API : preview, commit avec décisions, annulation d'un lot | F5 | P0 | J5 | L | L4-03 |
| L4-05 | Mobile : choix du fichier et de l'unité par défaut | F5 | P0 | J5 | M | L4-04 |
| L4-06 | Mobile : correspondance des colonnes | F5 | P0 | J5 | M | L4-04 |
| L4-07 | Mobile : rapport d'import et actions Corriger / Ignorer / Accepter | F5 | P0 | J5 | L | L4-04 |
| L4-08 | Fichiers de test : 147 lignes, .xlsx corrompu, encodages variés | F5 | P0 | J4 | S | — |
| L4-09 | Badge de provenance (saisie, import, appareil) sur mesure, chronologie et portail | F2/F4 | P0 | J5 | M | L2-09 |

## L5 — Partage & portail médecin

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L5-01 | API : sessions de partage, catégories, durée, premier jeton | F7 | P0 | J5 | L | L1-04 |
| L5-02 | API : rotation 60 s, usage unique, consommation atomique, tests de concurrence | F7 | P0 | J5 | L | L5-01 |
| L5-03 | API : claim par un médecin approuvé + limitation de débit | F7 | P0 | J6 | M | L5-02 |
| L5-04 | API : révocation, expiration (tâche planifiée + contrôle à chaque requête) | F7 | P0 | J6 | M | L5-03 |
| L5-05 | API : journal d'accès (AuditService, GET /shares/log) | F7 | P0 | J6 | M | L5-01 |
| L5-06 | Mobile : choix des catégories à partager et de la durée | F7 | P0 | J5 | M | L5-01 |
| L5-07 | Mobile : écran QR avec compte à rebours de rotation | F7 | P0 | J6 | L | L5-02 |
| L5-08 | Mobile : suivi en direct (« Dr X consulte », minuteur, bouton Mettre fin) | F7 | P0 | J6 | L | L5-03 |
| L5-09 | Mobile : écran « Qui a consulté mes données » | F7 | P0 | J7 | M | L5-05 |
| L5-10 | Portail : scanner QR dans le navigateur + code de secours | F8 | P0 | J6 | L | L5-03 |
| L5-11 | Portail : liste des patients partagés (statut, dernière donnée, qualité) | F8 | P0 | J6 | M | L5-03 |
| L5-12 | Portail : dossier patient (glycémie, chronologie, traitements, nutrition, activité, résumé IA) | F8 | P0 | J7 | XL | L5-11 |
| L5-13 | Portail : bandeau de compte à rebours et écran « Accès expiré » | F8 | P0 | J7 | M | L5-12 |
| L5-14 | Tests de sécurité du partage : double scan, jeton expiré, accès après expiration, catégorie décochée | F7 | P0 | J7 | L | L5-04 |

## L6 — Rapport & urgence

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L6-01 | Modèle du PDF « Préparer ma consultation » (react-pdf) | F9 | P0 | J8 | L | L3-03 |
| L6-02 | API : génération du rapport et téléchargement journalisé | F9 | P0 | J8 | M | L6-01 |
| L6-03 | Mobile : écran « Préparer ma consultation » et partage du PDF | F9 | P0 | J8 | M | L6-02 |
| L6-04 | Portail : téléchargement du rapport si autorisé | F9 | P0 | J8 | S | L6-02 |
| L6-05 | API : carte d'urgence, QR urgence, page publique limitée, notification d'ouverture | F10 | P1 | J8 | L | L5-05 |
| L6-06 | Mobile : éditeur de carte d'urgence, QR urgence, export image | F10 | P1 | J8 | L | L6-05 |

## L7 — Design & contenu

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L7-01 | Maquettes Figma des écrans patient | — | P0 | J1 | L | — |
| L7-02 | Maquettes Figma du portail médecin | — | P0 | J2 | L | — |
| L7-03 | Finaliser palette et typographies dans @glyka/ui-tokens | — | P0 | J2 | M | L7-01 |
| L7-04 | Logo, icône d'application, écran de lancement | — | P0 | J3 | M | — |
| L7-05 | Composants UI mobile : Button, Card, Input, RangeBadge, Screen | — | P0 | J2 | L | L7-03 |
| L7-06 | Textes français (fr.json) et messages d'erreur clairs | — | P0 | J5 | M | — |
| L7-07 | Script de données de démo : 90 jours, plusieurs profils de qualité | — | P0 | J4 | L | L2-01 |
| L7-08 | Scénario de démonstration et support de présentation | — | P0 | J9 | L | — |
| L7-09 | Vidéo de secours de la démonstration | — | P1 | J10 | M | L7-08 |
| L7-10 | Plan de communication : nom, identité, canaux (livrable du PBL) | — | P0 | J10 | M | — |
| L7-11 | Politique de confidentialité et avertissement d'usage | — | P0 | J6 | M | — |
| L7-12 | Étude concurrentielle rapide (applications de carnet de glycémie) | — | P1 | J2 | S | — |

## L8 — Hors-ligne & notifications

| ID | Ticket | F. | Prio | Jour | Taille | Dépend de |
|---|---|---|---|---|---|---|
| L8-01 | Valider l'ADR 0004 (architecture local-first) en réunion | F11 | P0 | J1 | S | — |
| L8-02 | Base SQLite locale : migrations, ouverture, chiffrement (SQLCipher à valider) | F11 | P0 | J2 | L | L0-11 |
| L8-03 | Repositories locaux (mesures, événements) avec écriture atomique dans l'outbox | F11 | P0 | J3 | L | L8-02 |
| L8-04 | API : POST /sync/push avec idempotence (SyncOpLog) | F11 | P0 | J4 | L | L2-01 |
| L8-05 | API : GET /sync/pull avec curseur stable et tombstones | F11 | P0 | J4 | L | L8-04 |
| L8-06 | Moteur de synchronisation mobile : push par lots, pull, reprise avec délai croissant | F11 | P0 | J5 | XL | L8-03, L8-05 |
| L8-07 | Détection de connectivité et déclencheurs (retour réseau, ouverture, tirer pour rafraîchir) | F11 | P0 | J5 | M | L8-06 |
| L8-08 | Coalescence de l'outbox (fonction pure + tests) | F11 | P0 | J3 | S | — |
| L8-09 | Tests de conflits et d'idempotence : rejeu, doublon, suppression hors-ligne, dérive d'horloge | F11 | P0 | J5 | L | L8-05 |
| L8-10 | Interface : « n mesures en attente », état de synchronisation, erreurs | F11 | P0 | J5 | M | L8-06 |
| L8-11 | Tableau de bord et analyse calculés depuis la base locale (moteur sur le téléphone) | F11 | P0 | J4 | L | L8-03 |
| L8-12 | Notifications locales : rappels de mesure programmables | F12 | P0 | J6 | M | L0-11 |
| L8-13 | Notifications locales : alerte de seuil et « pas de mesure depuis X heures » | F12 | P0 | J6 | M | L8-12 |
| L8-14 | Push serveur : enregistrement de l'appareil, file d'envoi, Expo Push | F12 | P0 | J8 | L | L0-11 |
| L8-15 | Écran de préférences : catégories, heures calmes, contenu sur écran verrouillé | F12 | P0 | J7 | M | L8-12 |
| L8-16 | Notifications serveur : médecin consulte / accès terminé, urgence ouverte, import terminé | F12 | P1 | J9 | M | L8-14 |
| L8-17 | Test hors-ligne de bout en bout sur un vrai téléphone (mode avion) | F11 | P0 | J9 | L | L8-06 |
