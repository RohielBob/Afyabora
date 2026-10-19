# Module `emergency`

**Lot : L6 · Fonctionnalité : F10 · Tickets : L6-05 (fait), L6-06**

Carte d'urgence : fiche minimale, QR urgence distinct et stable, page publique limitée.

## Routes

- `GET /emergency` · `PUT /emergency` : carte du patient (rôle PATIENT). Première lecture : carte vide et
  **désactivée**. `PUT` remplace toute la carte : un champ absent ou vide est effacé.
- `POST /emergency/regenerate` : nouveau QR. Le jeton n'est renvoyé **qu'ici** (l'application le garde) avec
  l'adresse à encoder (`PORTAL_URL/e/<jeton>`) ; l'ancien QR ne marche plus dès cet instant. L'état « activée »
  ne change pas. 10 par minute au plus.
- `GET /e/:token` : page publique limitée, **sans compte** (`@Public`). 10 ouvertures par minute et par
  adresse IP. Le portail (page `/e/<jeton>`) demande d'abord « Je suis un professionnel de santé ou un
  secouriste ».

## Règles de gestion

- **Uniquement les champs choisis par le patient** : un champ vide n'existe pas dans la réponse publique
  (`publicCard`, schéma `emergencyCardPublicSchema` strict). **Jamais d'historique glycémique**, d'identifiant,
  d'état « activée » ni de jeton.
- **Le QR ne marche que si la carte est activée ET qu'un jeton a été généré.** Désactiver (`enabled: false`)
  ou régénérer rend l'ancien QR inopérant **immédiatement** : la carte est relue en base à chaque ouverture.
  Jeton inconnu, remplacé, mal formé ou carte désactivée : **même 404**, sans plus de détail.
- **Jeton** : 32 octets aléatoires en base64url (comme le QR de partage, ADR-0003) ; **seul son hash SHA-256 est
  en base**. Un texte qui n'a pas la forme d'un jeton n'est pas cherché en base.
- **Chaque ouverture** : une ligne `EMERGENCY_VIEWED` au journal du patient (sans médecin : accès anonyme ;
  visible dans « Qui a consulté mes données ») et une **notification** dans la file d'envoi
  (`NotificationOutbox`, catégorie `EMERGENCY_ACCESS`), **au plus une toutes les 5 minutes** (un secouriste
  qui recharge la page ne déclenche pas dix notifications ; chaque ouverture reste journalisée). Le texte de la
  notification ne contient aucune donnée de santé. L'envoi réel (Expo Push, préférences, heures calmes) vient
  avec L8-14 / L8-16.
- Journal et notification sont écrits **sous verrou de la carte** (`FOR UPDATE`) : une désactivation au même
  instant passe avant ou après, jamais « entre » ; des ouvertures simultanées n'envoient qu'une notification.
  Base saturée : 503 « réessayez » (attente d'une connexion : 10 s, comme le partage).
- Réponse publique : `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy:
no-referrer`.

## Tests obligatoires

- [x] QR désactivé = 404 (et QR régénéré : l'ancien = 404).
- [x] Aucune donnée d'historique dans la réponse.
- [x] Ouverture notifiée au patient (file d'envoi, une par 5 minutes, sans donnée de santé).

Tests : `test/emergency-card.test.ts` (règles pures) ; `test/emergency-routes.test.ts` (vraie base : routes,
rôles, propriété, désactivation, régénération, journal, notification, ouvertures simultanées, limites de
débit) ; `test/openapi-contract.test.ts` (réponses identiques au contrat).

## Fichiers

| Fichier                   | Rôle                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `emergency.module.ts`     | Déclaration du module NestJS (importe `NotificationsModule`)                                  |
| `emergency.controller.ts` | `EmergencyController` (patient) et `PublicEmergencyController` (`/e/:token`) : pas de logique |
| `emergency.service.ts`    | Carte, QR, page publique : accès base (Prisma), journal, notification                         |
| `emergency-card.ts`       | Règles pures : jeton, adresse du QR, champs montrés, texte de la notification                 |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée (le patient est toujours
  celui du jeton de connexion).
- Toute entrée est validée avec un schéma de `@glyka/shared` (`emergencyCardSchema`).
- Aucun secret ni donnée de santé dans les logs ; le jeton n'est jamais enregistré ni journalisé.
