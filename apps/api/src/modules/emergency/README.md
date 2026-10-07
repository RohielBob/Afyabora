# Module `emergency`

**Lot : L6 · Fonctionnalité : F10 · Tickets : L6-05, L6-06**

Carte d'urgence : fiche minimale, QR urgence distinct, page publique limitée.

## Routes

- GET /emergency · PUT /emergency : carte du patient
- POST /emergency/regenerate : nouveau QR (l'ancien devient inopérant)
- GET /e/:token : page publique limitée (public, après confirmation « professionnel de santé / secouriste »)

## Règles de gestion

- Uniquement les champs choisis par le patient ; JAMAIS d'historique glycémique.
- Désactiver ou régénérer rend l'ancien QR inopérant immédiatement.
- Chaque ouverture : `AccessLog` + notification au patient (catégorie `EMERGENCY_ACCESS`).
- Limitation de débit sur `/e/:token`.

## Tests obligatoires

- [ ] QR désactivé = 404.
- [ ] Aucune donnée d'historique dans la réponse.
- [ ] Ouverture notifiée au patient.

## Fichiers

| Fichier                   | Rôle                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `emergency.module.ts`     | Déclaration du module NestJS                                                                           |
| `emergency.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `emergency.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
