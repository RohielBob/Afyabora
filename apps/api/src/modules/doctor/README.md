# Module `doctor`

**Lot : L5 · Fonctionnalité : F8 · Tickets : L5-03, L5-11, L5-12 (rapport : L6-04)**

Lecture des dossiers partagés pour le portail médecin (lecture seule, filtrée par catégories).

## Routes

- GET /doctor/sessions : sessions de partage du médecin (actives et expirées)
- GET /doctor/sessions/:id/summary · /measurements · /timeline (L5-12, **faits**)
- GET /doctor/sessions/:id/report (rapport PDF, L6-04)

## Règles de gestion

- Chaque requête revérifie : session ACTIVE, non expirée, appartenant à CE médecin.
- Le filtre de catégories est appliqué CÔTÉ SERVEUR (une catégorie décochée n'est jamais renvoyée).
- L'expiration est contrôlée avec l'horloge du serveur, jamais celle du client.
- Chaque consultation écrit une ligne dans `AccessLog` (une par **moment de lecture**, voir L5-12).
- `/report` exige la catégorie `REPORT_DOWNLOAD`.

## `GET /doctor/sessions` (L5-11, **fait**)

- Médecin **approuvé** seulement (`sharing/doctor-approval.ts`, partagé avec le scan L5-03), revérifié à
  chaque requête : en attente ou refusé ⇒ 403 `DOCTOR_NOT_APPROVED` ; patient ⇒ 403 (rôle) ; compte supprimé
  ⇒ 401.
- Sessions **scannées par ce médecin**, en cours et terminées (accès en cours d'abord, puis du plus récent au
  plus ancien ; 100 au plus). Les accès échus sont **expirés avant la lecture** (`expireDueSessions`).
- Du patient : prénom et type de diabète seulement. **Dernière mesure et qualité** (30 jours, même calcul
  que l'application, `InsightsService.quality`) **seulement pendant l'accès et si l'historique glycémique
  est partagé** ; sinon `null`.
- La liste ne lit pas le dossier : **aucune ligne** dans le journal du patient (les consultations du dossier,
  L5-12, y seront écrites).
- Tests : `test/doctor-sessions.test.ts` (vraie base).

## Dossier partagé : `/summary`, `/measurements`, `/timeline` (L5-12, **fait**)

Ces routes figurent **déjà au contrat** (attribuées à un ticket « L5-15 » absent du backlog) : codées ici, contrat
inchangé. Service : `record.service.ts` ; chronologie : `timeline.ts` ; journal : `record-view.ts`.

- **Avant toute lecture, à chaque requête** : médecin toujours approuvé (`DOCTOR_NOT_APPROVED`, y compris si
  l'approbation est retirée après le scan) ; session ACTIVE, à CE médecin, pas échue à l'horloge du serveur
  (`requireActiveAccess`, L5-04 : 403 `SESSION_EXPIRED` / `SESSION_REVOKED` / `CATEGORY_NOT_SHARED`, autre
  médecin 403, inconnue 404).
- **Filtre des catégories côté serveur** :
  - `/measurements` exige `GLUCOSE_HISTORY` ; la note d'une mesure n'est envoyée (et même lue) qu'avec
    `PERSONAL_NOTES` ; mesures supprimées jamais envoyées ; période `[from ; to[`, curseur, comme
    `GET /measurements` ;
  - `/timeline` : mesures (`GLUCOSE_HISTORY`, état selon les seuils **du patient**, provenance), repas
    (`MEALS`), activités (`ACTIVITY`), traitements déclarés (`TREATMENTS`), chacun seulement s'il est partagé ;
    au moins une de ces catégories, sinon 403. Mesures et évènements mélangés dans un seul ordre (date puis
    identifiant, décroissants), pages par curseur **à travers les deux tables** sans doublon ni oubli. Libellé :
    texte du patient pour un évènement, **code du contexte** pour une mesure (le portail le traduit). Le texte
    libre chiffré des évènements n'est pas envoyé (le contrat ne donne que le libellé). Pas de ligne `ALERT`
    (une mesure porte déjà son état) ;
  - `/summary` : prénom, type, année du diagnostic, unité, seuils (jamais le nom ni la date de naissance) ;
    qualité et statistiques des 30 derniers jours si `GLUCOSE_HISTORY` **ou** `AI_SUMMARY` est partagé (sinon
    qualité calculée sur **zéro** mesure et statistiques nulles : rien n'est révélé, et le contrat, qui exige
    `quality`, est respecté) ; observations de l'analyse seulement avec `AI_SUMMARY` (leurs preuves, des
    identifiants de mesures, seulement si `GLUCOSE_HISTORY` est aussi partagé). Mêmes calculs que l'application
    (`InsightsService`).
- **Journal du patient (`SHARE_VIEWED`)** : une ligne par **moment de lecture**, pas par requête : au plus une
  par session toutes les **5 minutes** (`VIEW_LOG_WINDOW_MS`). Ouvrir le dossier fait plusieurs requêtes et la
  page se relit seule : une ligne par requête afficherait « 14 consultations » pour une seule ouverture. La
  ligne est écrite **avant** la lecture, sous verrou de la session (`FOR UPDATE`) : deux requêtes simultanées
  n'écrivent qu'une ligne, et un arrêt par le patient au même instant passe avant ou après (lecture refusée,
  rien journalisé). Une lecture refusée n'écrit rien.
- Tests : `test/doctor-record.test.ts` (vraie base), `test/doctor-timeline.test.ts` (sans base).

## Tests obligatoires

- [x] 403 après expiration même si la page est encore ouverte. (L5-12)
- [x] 403 pour un médecin qui n'est pas celui de la session. (L5-12)
- [x] Notes personnelles absentes si non cochées. (L5-12)
- [x] Médecin `PENDING` refusé. (L5-11, L5-12)

## Fichiers

| Fichier                | Rôle                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `doctor.module.ts`     | Déclaration du module NestJS                                                                           |
| `doctor.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `doctor.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
