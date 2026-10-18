# Module `doctor`

**Lot : L5 · Fonctionnalité : F8 · Tickets : L5-03, L5-11, L5-12**

Lecture des dossiers partagés pour le portail médecin (lecture seule, filtrée par catégories).

## Routes

- GET /doctor/sessions : sessions de partage du médecin (actives et expirées)
- GET /doctor/sessions/:id/summary · /measurements · /timeline · /report

## Règles de gestion

- Chaque requête revérifie : session ACTIVE, non expirée, appartenant à CE médecin.
- Le filtre de catégories est appliqué CÔTÉ SERVEUR (une catégorie décochée n'est jamais renvoyée).
- L'expiration est contrôlée avec l'horloge du serveur, jamais celle du client.
- Chaque consultation écrit une ligne dans `AccessLog`.
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

## Tests obligatoires

- [ ] 403 après expiration même si la page est encore ouverte.
- [ ] 403 pour un médecin qui n'est pas celui de la session.
- [ ] Notes personnelles absentes si non cochées.
- [ ] Médecin `PENDING` refusé.

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
