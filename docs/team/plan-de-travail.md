# Plan de travail — 10 jours

Ce plan est **issu de `backlog.csv`** : modifier le CSV, pas ce fichier, puis régénérer si besoin.

## 1. Rôles proposés (à adapter à la taille réelle de l'équipe)

| Rôle                 | Lots principaux                                 | Remarques                                        |
| -------------------- | ----------------------------------------------- | ------------------------------------------------ |
| **Lead technique**   | L0, relecture de tout, **L5 (cœur du QR)**      | Arbitre, protège `main`, gère les contrats       |
| **Back-end**         | L1 (API), L2 (API), L4, L8 (API sync), L6 (API) | Prisma, NestJS, tests                            |
| **Mobile 1**         | L1, L2, L8 (local-first, sync)                  | Le plus critique : base locale + synchronisation |
| **Mobile 2**         | L4, L5 (écrans), L6, L8 (notifications)         | Import, QR, carte d'urgence                      |
| **Portail**          | L1-11, L5 (portail), L6-04                      | React/Vite                                       |
| **Data / IA**        | L3                                              | `@glyka/analytics`, gabarits, garde-fous, LLM    |
| **Design & contenu** | L7                                              | Figma, tokens, textes, démo, communication       |

> Si l'équipe est plus petite, **fusionner d'abord Portail + Mobile 2**, et garder Back-end et Mobile 1 séparés (chemin critique).

## 2. Chemin critique

```
L0 (socle, J1) → L8-02/03 base locale (J2-J3) → L2 saisie + dashboard (J3-J4) → L8-04/05 API sync (J4) → L8-06 moteur de sync (J5)
L1 auth (J2) → L5 partage API (J5-J6) → L5 QR mobile + portail (J6-J7) → L5-14 tests de sécurité (J7)
```

Si le moteur de sync (L8-06, XL) ou le QR (L5) dérape, **tout le reste attend** : ce sont les deux premières choses à surveiller chaque jour.

## 3. Les tickets jour par jour

### J1 — Cadrage et socle : dépôt, CI, Docker, schéma de base, contrat OpenAPI v0 gelé, maquettes, ADR validées

| ID    | Ticket                                                                                            | Prio | Taille |
| ----- | ------------------------------------------------------------------------------------------------- | ---- | ------ |
| L0-01 | Initialiser le dépôt GitHub : protéger main/develop, créer labels, projet Kanban, jalons J1 à J10 | P0   | S      |
| L0-02 | Lancer pnpm install, aligner les versions (expo install --fix) et vérifier que tout démarre       | P0   | M      |
| L0-03 | Configurer ESLint (typescript-eslint, react-hooks), Prettier, Husky et commitlint                 | P0   | M      |
| L0-04 | Route GET /health + test + CI verte                                                               | P0   | S      |
| L0-05 | Valider docker compose (db, mailpit) et le Dockerfile de l'API                                    | P0   | M      |
| L0-06 | Migrer le schéma Prisma initial et documenter la procédure de migration                           | P0   | M      |
| L0-07 | Contrat OpenAPI v0 : exporter, geler et publier dans docs/api                                     | P0   | M      |
| L0-08 | Relecture des schémas Zod partagés avec les responsables de lot                                   | P0   | M      |
| L0-09 | Relire et accepter les ADR 0001 à 0006                                                            | P0   | S      |
| L7-01 | Maquettes Figma des écrans patient                                                                | P0   | L      |
| L8-01 | Valider l'ADR 0004 (architecture local-first) en réunion                                          | P0   | S      |

### J2 — Comptes + fondations local-first : auth API/mobile, base SQLite locale, APK de développement, composants UI

| ID    | Ticket                                                                                        | Prio | Taille |
| ----- | --------------------------------------------------------------------------------------------- | ---- | ------ |
| L0-11 | Construire l'APK « development build » avec EAS (nécessaire au push et au chiffrement SQLite) | P0   | L      |
| L1-01 | API : inscription patient + email de vérification (Mailpit)                                   | P0   | L      |
| L1-02 | API : connexion, refresh rotatif, déconnexion, verrouillage après 5 échecs                    | P0   | L      |
| L1-03 | API : mot de passe oublié et réinitialisation                                                 | P0   | M      |
| L1-04 | API : garde JWT global, rôles, tests d'autorisation                                           | P0   | M      |
| L1-05 | API : profil patient et seuils d'alerte (validation Zod)                                      | P0   | M      |
| L1-06 | Mobile : écrans bienvenue, inscription, vérification email, connexion, mot de passe oublié    | P0   | L      |
| L1-07 | Mobile : stockage sécurisé des jetons et rafraîchissement automatique de session              | P0   | M      |
| L1-10 | Mobile : consentement explicite et avertissement « outil d'aide, pas un avis médical »        | P0   | S      |
| L7-02 | Maquettes Figma du portail médecin                                                            | P0   | L      |
| L7-03 | Finaliser palette et typographies dans @glyka/ui-tokens                                       | P0   | M      |
| L7-05 | Composants UI mobile : Button, Card, Input, RangeBadge, Screen                                | P0   | L      |
| L7-12 | Étude concurrentielle rapide (applications de carnet de glycémie)                             | P1   | S      |
| L8-02 | Base SQLite locale : migrations, ouverture, chiffrement (SQLCipher à valider)                 | P0   | L      |

### J3 — Mesures local-first : saisie hors-ligne, outbox, tableau de bord v1, profil, compte médecin

| ID    | Ticket                                                                                       | Prio | Taille |
| ----- | -------------------------------------------------------------------------------------------- | ---- | ------ |
| L1-08 | Mobile : assistant de profil en 3 étapes                                                     | P0   | M      |
| L1-09 | Mobile : verrouillage de l'app par biométrie ou code                                         | P0   | M      |
| L1-11 | Portail : inscription et connexion médecin, page « compte en attente »                       | P0   | L      |
| L1-12 | Script d'administration : approuver un compte médecin                                        | P0   | S      |
| L1-13 | Tests auth : email non vérifié, verrouillage, rotation et réutilisation du refresh           | P0   | M      |
| L2-01 | API : mesures CRUD idempotent (UUID client), conversion mg/dL, tombstones                    | P0   | L      |
| L2-03 | Mobile : saisie rapide d'une mesure (valeur, unité, date, contexte), écriture locale d'abord | P0   | L      |
| L2-04 | Mobile : confirmation de valeur inhabituelle + message de sécurité hypo/hyper                | P0   | M      |
| L2-05 | Mobile : tableau de bord — dernière mesure et badge d'état (forme + libellé + couleur)       | P0   | M      |
| L3-01 | Étendre les tests d'analytics avec un jeu de données de référence validé                     | P0   | M      |
| L7-04 | Logo, icône d'application, écran de lancement                                                | P0   | M      |
| L8-03 | Repositories locaux (mesures, événements) avec écriture atomique dans l'outbox               | P0   | L      |
| L8-08 | Coalescence de l'outbox (fonction pure + tests)                                              | P0   | S      |

### J4 — Chronologie et analyse sur le téléphone ; API de synchronisation (push/pull) ; analyseurs d'import

| ID    | Ticket                                                                              | Prio | Taille |
| ----- | ----------------------------------------------------------------------------------- | ---- | ------ |
| L2-02 | API : événements (repas, activité, traitement déclaré)                              | P0   | M      |
| L2-06 | Mobile : graphique d'évolution 7/14/30/90 jours avec bande cible                    | P0   | L      |
| L2-07 | Mobile : statistiques et comparaison avec la période précédente                     | P0   | M      |
| L2-08 | Mobile : score de qualité des données et phrase d'explication                       | P0   | M      |
| L2-09 | Mobile : chronologie (groupée par jour, filtres, badges de provenance)              | P0   | L      |
| L2-10 | Mobile : ajout rapide d'un repas, d'une activité, d'un traitement déclaré           | P0   | M      |
| L2-11 | Mobile : modification et suppression d'une mesure                                   | P0   | M      |
| L2-12 | Tests API mesures : idempotence, conversions, bornes plausibles, date future        | P0   | M      |
| L3-02 | Prendre en compte le fuseau horaire du patient (créneaux, jours)                    | P0   | M      |
| L4-01 | Analyseur CSV : séparateurs, virgule/point décimal, encodages UTF-8 et Windows-1252 | P0   | L      |
| L4-02 | Analyseur XLSX                                                                      | P0   | M      |
| L4-03 | Règles de validation (VALID, DUPLICATE, INCONSISTENT, ERROR) avec tests             | P0   | L      |
| L4-08 | Fichiers de test : 147 lignes, .xlsx corrompu, encodages variés                     | P0   | S      |
| L7-07 | Script de données de démo : 90 jours, plusieurs profils de qualité                  | P0   | L      |
| L8-04 | API : POST /sync/push avec idempotence (SyncOpLog)                                  | P0   | L      |
| L8-05 | API : GET /sync/pull avec curseur stable et tombstones                              | P0   | L      |
| L8-11 | Tableau de bord et analyse calculés depuis la base locale (moteur sur le téléphone) | P0   | L      |

### J5 — Moteur de synchronisation mobile ; assistant d'import ; API de partage ; écran Analyse

| ID    | Ticket                                                                                        | Prio | Taille |
| ----- | --------------------------------------------------------------------------------------------- | ---- | ------ |
| L0-10 | Déployer l'API et le portail sur un environnement de test partagé                             | P1   | L      |
| L3-03 | API : /insights et /quality branchées sur @glyka/analytics                                    | P0   | M      |
| L3-04 | Mobile : écran Analyse avec « Voir les mesures concernées »                                   | P0   | L      |
| L3-09 | Mobile : analyse et gabarits calculés hors-ligne depuis la base locale                        | P0   | M      |
| L4-04 | API : preview, commit avec décisions, annulation d'un lot                                     | P0   | L      |
| L4-05 | Mobile : choix du fichier et de l'unité par défaut                                            | P0   | M      |
| L4-06 | Mobile : correspondance des colonnes                                                          | P0   | M      |
| L4-07 | Mobile : rapport d'import et actions Corriger / Ignorer / Accepter                            | P0   | L      |
| L4-09 | Badge de provenance (saisie, import, appareil) sur mesure, chronologie et portail             | P0   | M      |
| L5-01 | API : sessions de partage, catégories, durée, premier jeton                                   | P0   | L      |
| L5-02 | API : rotation 60 s, usage unique, consommation atomique, tests de concurrence                | P0   | L      |
| L5-06 | Mobile : choix des catégories à partager et de la durée                                       | P0   | M      |
| L7-06 | Textes français (fr.json) et messages d'erreur clairs                                         | P0   | M      |
| L8-06 | Moteur de synchronisation mobile : push par lots, pull, reprise avec délai croissant          | P0   | XL     |
| L8-07 | Détection de connectivité et déclencheurs (retour réseau, ouverture, tirer pour rafraîchir)   | P0   | M      |
| L8-09 | Tests de conflits et d'idempotence : rejeu, doublon, suppression hors-ligne, dérive d'horloge | P0   | L      |
| L8-10 | Interface : « n mesures en attente », état de synchronisation, erreurs                        | P0   | M      |

### J6 — QR dynamique, portail (scan, claim, liste), notifications locales

| ID    | Ticket                                                                       | Prio | Taille |
| ----- | ---------------------------------------------------------------------------- | ---- | ------ |
| L5-03 | API : claim par un médecin approuvé + limitation de débit                    | P0   | M      |
| L5-04 | API : révocation, expiration (tâche planifiée + contrôle à chaque requête)   | P0   | M      |
| L5-05 | API : journal d'accès (AuditService, GET /shares/log)                        | P0   | M      |
| L5-07 | Mobile : écran QR avec compte à rebours de rotation                          | P0   | L      |
| L5-08 | Mobile : suivi en direct (« Dr X consulte », minuteur, bouton Mettre fin)    | P0   | L      |
| L5-10 | Portail : scanner QR dans le navigateur + code de secours                    | P0   | L      |
| L5-11 | Portail : liste des patients partagés (statut, dernière donnée, qualité)     | P0   | M      |
| L7-11 | Politique de confidentialité et avertissement d'usage                        | P0   | M      |
| L8-12 | Notifications locales : rappels de mesure programmables                      | P0   | M      |
| L8-13 | Notifications locales : alerte de seuil et « pas de mesure depuis X heures » | P0   | M      |

### J7 — Dossier patient côté médecin, journal d'accès, IA reformulée avec garde-fous

| ID    | Ticket                                                                                               | Prio | Taille |
| ----- | ---------------------------------------------------------------------------------------------------- | ---- | ------ |
| L3-05 | API : interface LlmProvider, implémentation, repli automatique sur les gabarits                      | P0   | L      |
| L3-06 | Résumé automatique (IA-3) avec garde-fous                                                            | P0   | L      |
| L3-07 | Jeu de questions-pièges et test automatique des garde-fous                                           | P0   | M      |
| L3-10 | Journaliser les réponses du modèle de langage pour audit                                             | P0   | S      |
| L5-09 | Mobile : écran « Qui a consulté mes données »                                                        | P0   | M      |
| L5-12 | Portail : dossier patient (glycémie, chronologie, traitements, nutrition, activité, résumé IA)       | P0   | XL     |
| L5-13 | Portail : bandeau de compte à rebours et écran « Accès expiré »                                      | P0   | M      |
| L5-14 | Tests de sécurité du partage : double scan, jeton expiré, accès après expiration, catégorie décochée | P0   | L      |
| L8-15 | Écran de préférences : catégories, heures calmes, contenu sur écran verrouillé                       | P0   | M      |

### J8 — Rapport PDF, carte d'urgence, push serveur

| ID    | Ticket                                                                             | Prio | Taille |
| ----- | ---------------------------------------------------------------------------------- | ---- | ------ |
| L3-08 | Question libre sur l'historique (IA-4) : remplacé par l'assistant (lot L9)         | P1   | L      |
| L6-01 | Modèle du PDF « Préparer ma consultation » (react-pdf)                             | P0   | L      |
| L6-02 | API : génération du rapport et téléchargement journalisé                           | P0   | M      |
| L6-03 | Mobile : écran « Préparer ma consultation » et partage du PDF                      | P0   | M      |
| L6-04 | Portail : téléchargement du rapport si autorisé                                    | P0   | S      |
| L6-05 | API : carte d'urgence, QR urgence, page publique limitée, notification d'ouverture | P1   | L      |
| L6-06 | Mobile : éditeur de carte d'urgence, QR urgence, export image                      | P1   | L      |
| L8-14 | Push serveur : enregistrement de l'appareil, file d'envoi, Expo Push               | P0   | L      |

### J9 — GEL DES FONCTIONNALITÉS à midi — intégration, test hors-ligne sur téléphone réel, corrections, APK

| ID    | Ticket                                                                                    | Prio | Taille |
| ----- | ----------------------------------------------------------------------------------------- | ---- | ------ |
| L1-14 | API : export des données et suppression du compte                                         | P1   | M      |
| L7-08 | Scénario de démonstration et support de présentation                                      | P0   | L      |
| L8-16 | Notifications serveur : médecin consulte / accès terminé, urgence ouverte, import terminé | P1   | M      |
| L8-17 | Test hors-ligne de bout en bout sur un vrai téléphone (mode avion)                        | P0   | L      |

### J10 — Présentation : répétition, support, README, plan de communication

| ID    | Ticket                                                          | Prio | Taille |
| ----- | --------------------------------------------------------------- | ---- | ------ |
| L7-09 | Vidéo de secours de la démonstration                            | P1   | M      |
| L7-10 | Plan de communication : nom, identité, canaux (livrable du PBL) | P0   | M      |

## 4. Règle de coupe si le temps manque

Dans cet ordre : **1.** L6-05/L6-06 (carte d'urgence) → **2.** lot L9 (assistant Afyabora, qui remplace L3-08) → **3.** onglets Nutrition/Activité du portail → **4.** L8-16 (push serveur) → **5.** L8-15 (écran de préférences détaillé, garder un réglage minimal).
**On ne coupe jamais :** le partage par QR (L5), l'import (L4), la saisie hors-ligne et sa synchronisation (L8-02 à L8-09), les notifications locales (L8-12, L8-13).

## 5. Risques propres à la saisie hors-ligne

- La synchronisation est la partie la plus difficile du projet : **démarrer le jour 2**, pas à la fin.
- Tester sur un **vrai téléphone en mode avion** dès J5, pas seulement sur émulateur.
- Le push Android exige un **development build** et Firebase : à préparer au J2 (L0-11).
- Charge élevée : 116 tickets (dont les 11 de l'assistant, lot L9, ajoutés le 2026-10-11) et plusieurs XL. Découper tout ticket XL avant de le prendre.
