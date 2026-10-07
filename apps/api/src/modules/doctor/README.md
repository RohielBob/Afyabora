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
