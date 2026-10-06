# Module `reports`

**Lot : L6 · Fonctionnalité : F9 · Tickets : L6-01, L6-02**

Rapport PDF « Préparer ma consultation ».

## Routes

- GET /reports/consultation?period=14|30|90 : PDF (patient) ; version médecin via /doctor/sessions/:id/report

## Règles de gestion

- Chiffres identiques au tableau de bord (même moteur `analytics`).
- Contient : identité, période, qualité des données, % dans la cible/au-dessus/en dessous, épisodes, événements inhabituels, jours incomplets, points à examiner, graphique, avertissement « outil d'aide », date et auteur de génération.
- Génération < 10 s pour 90 jours.
- Le téléchargement par un médecin est journalisé.

## Tests obligatoires

- [ ] Chiffres du PDF = chiffres de `analyze()`.
- [ ] Génération en moins de 10 s sur 90 jours (≈ 270 mesures).

## Fichiers

| Fichier                 | Rôle                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `reports.module.ts`     | Déclaration du module NestJS                                                                           |
| `reports.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `reports.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
