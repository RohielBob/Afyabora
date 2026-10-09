# Réunion d'équipe — validation des décisions d'architecture (L0-09 et L8-01)

**Objectif :** accepter (ou modifier) les ADR 0001 à 0006, dont l'ADR-0004 (ticket L8-01). **Durée prévue : 45 minutes.** Présents : toute l'équipe (au minimum : lead technique, back-end, mobile, portail, data/IA, design).
Chaque ADR a un statut « Proposé » : tant que l'équipe ne l'a pas accepté en réunion, il ne l'est pas. Ce document sert de feuille de route ; remplissez la colonne « Décision » pendant la réunion.

**Avant la réunion :** chacun lit les 6 ADR dans `docs/adr/` (2 à 3 minutes chacun) et les questions ci-dessous.

| #    | Sujet                                               | Temps  | Qui doit surtout donner son avis  |
| ---- | --------------------------------------------------- | ------ | --------------------------------- |
| 0001 | Monorepo pnpm + Turborepo                           | 5 min  | Tous                              |
| 0002 | Glycémie en mg/dL entier                            | 5 min  | Data/IA, mobile, back-end         |
| 0003 | QR dynamique à jetons opaques                       | 10 min | Lead technique, back-end, portail |
| 0004 | Local-first (hors-ligne) — **L8-01**                | 10 min | Mobile, back-end                  |
| 0005 | Analyse déterministe, LLM seulement pour reformuler | 8 min  | Data/IA, lead                     |
| 0006 | Notifications locales puis push serveur             | 7 min  | Mobile, back-end                  |

---

## ADR-0001 — Monorepo pnpm + Turborepo

- **Décision en une phrase :** un seul dépôt Git pour l'API, le mobile, le portail et les paquets communs (`shared`, `analytics`, `ui-tokens`).
- **Pourquoi :** un changement de schéma partagé est vu tout de suite par les trois applications et fait échouer la CI s'il est incompatible.
- **Ce que ça nous coûte :** Expo impose `node-linker=hoisted` ; React doit rester à la même version partout (19.1.0).
- **Questions :** Tout le monde sait-il installer le projet (`pnpm install`) et lancer les 5 commandes de contrôle ? Quelqu'un a-t-il rencontré un problème ?
- **Décision :** ☐ Accepté ☐ Accepté avec modification ☐ Refusé — Remarques : ……………………

## ADR-0002 — Glycémie stockée en mg/dL entier

- **Décision :** toute glycémie est stockée en mg/dL (entier), avec la valeur et l'unité d'origine conservées. 1 g/L = 100 mg/dL ; 1 mmol/L ≈ 18,016 mg/dL.
- **Pourquoi :** pas d'erreur d'arrondi, seuils et doublons comparables ; changer l'unité d'affichage ne touche jamais les données.
- **Ce que ça nous coûte :** les mmol/L sont arrondis à l'entier (la valeur d'origine est gardée).
- **Questions :** Les bornes plausibles (20 à 600 mg/dL) conviennent-elles ? Les seuils par défaut doivent-ils être relus par un professionnel de santé avant la démo ?
- **Décision :** ☐ Accepté ☐ Accepté avec modification ☐ Refusé — Remarques : ……………………

## ADR-0003 — QR dynamique : jetons opaques, rotatifs, à usage unique

- **Décision :** le QR contient un jeton aléatoire (≥ 32 octets), jamais de donnée médicale ; le serveur ne garde que son hash ; le jeton change toutes les 60 s et ne sert qu'une fois ; le médecin doit être connecté **et approuvé** ; l'accès démarre au scan, se filtre par catégories côté serveur et se révoque à tout moment ; tout est journalisé.
- **Pourquoi :** une capture d'écran du QR devient inutile en moins d'une minute ; le patient garde le contrôle.
- **Ce que ça nous coûte :** le partage nécessite le réseau ; tests de sécurité obligatoires (L5-14).
- **Questions :** 60 s est-il une bonne durée pour la démo ? Qui approuve les comptes médecins pendant le projet (script d'administration L1-12) ? Qui porte le lot L5, chemin critique du projet ?
- **Décision :** ☐ Accepté ☐ Accepté avec modification ☐ Refusé — Remarques : ……………………

## ADR-0004 — Application mobile local-first — ticket L8-01

- **Décision :** le téléphone a une base SQLite locale, source de vérité pour l'affichage ; toute écriture va d'abord en local avec une file d'opérations (outbox) dans la même transaction ; les identifiants sont des UUID créés sur l'appareil ; `POST /sync/push` (≤ 200 opérations, idempotent) et `GET /sync/pull` (curseur, suppressions incluses) ; en cas de conflit, la dernière écriture gagne ; l'analyse tourne sur le téléphone.
- **Pourquoi :** la saisie hors-ligne est une exigence validée du MVP.
- **Ce que ça nous coûte :** architecture à poser dès le jour 2 (impossible à « greffer » à la fin) ; ticket L8-06 de taille XL à découper ; chiffrement de la base locale à valider et **development build obligatoire** (L0-11).
- **Questions :** Une seule personne est-elle clairement responsable du moteur de synchronisation ? Accepte-t-on « un seul appareil actif par patient » comme cas nominal ? Que sacrifie-t-on en premier si on est en retard (voir ADR-0006) ?
- **Décision :** ☐ Accepté ☐ Accepté avec modification ☐ Refusé — Remarques : ……………………

## ADR-0005 — L'analyse est déterministe ; le modèle de langage ne fait que reformuler

- **Décision :** chiffres et observations viennent de `@glyka/analytics` (code testé) avec la liste des mesures qui les justifient ; un modèle de langage reçoit des faits agrégés pseudonymisés et ne fait que les mettre en mots ; sans modèle, des gabarits français prennent le relais ; jamais de diagnostic ni de dose ; estimation d'HbA1c exclue.
- **Pourquoi :** chaque affirmation de l'app est vérifiable ; la démo ne dépend d'aucune API externe.
- **Ce que ça nous coûte :** texte plus sobre qu'un chatbot libre (c'est voulu).
- **Questions :** Quel fournisseur de modèle (ou aucun pour le MVP) ? Qui rejoue les questions-pièges à chaque changement de consigne ?
- **Décision :** ☐ Accepté ☐ Accepté avec modification ☐ Refusé — Remarques : ……………………

## ADR-0006 — Notifications : locales d'abord, push serveur ensuite, sans valeur de santé par défaut

- **Décision :** rappels et alertes de seuil en notifications locales (fonctionnent hors-ligne) ; push serveur pour les événements côté serveur (consultation par un médecin, carte d'urgence ouverte, import terminé) ; **aucune valeur de santé dans le texte par défaut** ; préférences par catégorie et heures calmes.
- **Pourquoi :** exigence validée du MVP, et la confidentialité passe avant le confort.
- **Ce que ça nous coûte :** le push Android exige un development build et Firebase (L0-11) ; en cas de retard, on coupe le push serveur (L8-16) avant les notifications locales.
- **Questions :** Qui crée le compte Expo et le projet Firebase ? Qui teste sur un vrai téléphone Android ?
- **Décision :** ☐ Accepté ☐ Accepté avec modification ☐ Refusé — Remarques : ……………………

## (Pour information) ADR-0007 — Nom « Afyabora » et identifiants internes

Déjà décidée par le groupe. À noter : l'identifiant Android/iOS (`com.glyka.app`) devient **définitif à la première publication** ; faut-il le changer en `com.afyabora.app` avant le premier build EAS ?

---

## Après la réunion

1. Remplir le compte-rendu avec `docs/team/templates/compte-rendu.md` (décisions, responsables, échéances).
2. Ouvrir une PR `docs: accepte les ADR 0001 à 0006 (L0-09, L8-01)` : sur chaque ADR, remplacer la ligne « Statut » par `Accepté — réunion du <date>, présents : <noms>` (et noter les modifications décidées). Un ADR refusé ou modifié est corrigé **avant** d'être accepté.
3. Cocher L0-09 et L8-01 dans le Kanban et dans `docs/team/etat-davancement.md`.

---

## Points relevés par l'audit du dépôt (2026-10-09) — présentés et acceptés en réunion

Résultat de la réunion du 2026-10-09 : **les six ADR sont acceptés**. Le détail est dans `compte-rendu-2026-10-09-adr.md` et dans chaque ADR.

| ADR  | Point relevé                                                                             | Décision                                                             |
| ---- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0001 | L'API utilise React 18.3.1 (PDF) alors que le reste est en 19.1.0                        | Exception documentée, pas de montée de version pendant le MVP        |
| 0004 | `syncPushRequestSchema` valide tout le lot : une opération fausse ferait échouer les 200 | Validation opération par opération (L8-04)                           |
| 0004 | Dates acceptées avec décalage (`+01:00`), comparées comme du texte                       | Normalisation UTC à l'écriture (L8-03, L8-04)                        |
| 0004 | Base locale `glyka.db` partagée entre comptes sur un même téléphone                      | Vidée à la déconnexion après envoi de l'outbox (L1-07, L8-02)        |
| 0004 | Le curseur `(updatedAt, id)` peut sauter une ligne                                       | Marge de recouvrement au pull (L8-05)                                |
| 0004 | Une horloge de téléphone déréglée gagne tous les conflits                                | `clientUpdatedAt` > 5 min dans le futur rejeté (L8-04)               |
| 0004 | Jeton expiré hors-ligne                                                                  | L'app reste utilisable ; l'outbox n'est jamais perdue (L1-07, L8-06) |
| 0004 | Le pull pourrait écraser une modification locale non envoyée                             | Ligne `pending_sync = 1` protégée (L8-06)                            |
| 0004 | Development build + `com.glyka.app` définitif au premier build                           | À trancher avant L0-11                                               |
| 0005 | Fournisseur de LLM non choisi                                                            | MVP : `LLM_PROVIDER=none`, gabarits                                  |
| 0006 | Le texte d'exemple disait « Glyka »                                                      | Corrigé en « Afyabora » (ADR-0007)                                   |
