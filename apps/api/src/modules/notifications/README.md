# Module `notifications`

**Lot : L8 · Fonctionnalité : F12 · Tickets : L8-14, L8-16**

Notifications serveur (push via Expo) et préférences. Les rappels et alertes locales sont gérés sur le téléphone (voir `apps/mobile/src/features/notifications`).

## Routes

- POST /devices : enregistre le jeton push de l'appareil
- GET/PUT /notifications/preferences
- (interne) `NotificationsService.enqueue(userId, notification, client?)` : met une notification dans la file
  (`NotificationOutbox`, PENDING), dans la transaction de l'évènement si `client` est fourni. **Fait (L6-05)**,
  utilisé par l'ouverture de la carte d'urgence ; l'envoi de la file reste à faire (L8-14).

## Règles de gestion

- Catégories : `NOTIFICATION_CATEGORIES` de `@glyka/shared`.
- Par défaut, AUCUNE valeur de santé dans le texte d'une notification (écran verrouillé) : « Nouvelle alerte Glyka — ouvrez l'app ».
- Respecter les préférences et les heures calmes avant d'envoyer.
- File `NotificationOutbox` traitée par une tâche planifiée ; erreurs et tickets de réception Expo gérés ; jetons invalides supprimés.
- Notifications serveur du MVP : médecin consulte / accès terminé, ouverture de la carte d'urgence, import terminé.

## Tests obligatoires

- [ ] Préférence désactivée : aucune notification envoyée.
- [ ] Heures calmes respectées.
- [ ] Le texte ne contient aucune valeur de glycémie par défaut.

## Fichiers

| Fichier                       | Rôle                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `notifications.module.ts`     | Déclaration du module NestJS                                                                           |
| `notifications.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `notifications.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
