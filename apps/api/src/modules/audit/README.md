# Module `audit`

**Lot : L5 · Fonctionnalité : F7 · Tickets : L5-05**

Journal d'accès : trace qui a consulté quoi et quand. Service interne utilisé par `sharing`, `doctor`, `emergency`, `reports`.

## Routes

- (service interne, pas de route publique ; le patient lit son journal via GET /shares/log)

## Règles de gestion

- Une ligne par évènement : acteur, patient, session, action, IP, date.
- Jamais de contenu médical dans le journal. Le journal n'est ni modifiable ni supprimable par l'utilisateur.

## Ce qui est fait (L5-05)

- **Écriture** : `access-log.ts`, `writeAccessLog(client, lignes)`, est le **seul** endroit qui écrit dans
  `AccessLog`. Les actions sont typées (`ACCESS_ACTIONS` de `@glyka/shared`) : une faute de frappe ne compile
  pas. On écrit avec la transaction de l'évènement : l'évènement et sa trace réussissent ou échouent
  ensemble. Utilisé par le scan (`SHARE_CLAIMED`, L5-03), la révocation (`SHARE_REVOKED`) et l'expiration
  (`SHARE_EXPIRED`, L5-04). `AuditService.record()` pour les autres modules (consultation du dossier L5-12,
  urgence L6, rapport).
- **Lecture** : `AuditService.list()` sert `GET /shares/log` (module `sharing`) : du plus récent au plus
  ancien, par pages (curseur ; 500 lignes par défaut, 2000 au plus), avec le **nom** du médecin (une seule
  requête par page). Jamais l'adresse IP ni l'identifiant du médecin. Accès d'urgence anonyme ou compte
  médecin supprimé : ligne gardée, sans nom.
- Personne ne peut modifier ni supprimer une ligne : aucune route ne le permet (testé).
- Tests : `test/audit-access-log.test.ts` (sans base), `test/sharing-log.test.ts` (vraie base).

## Tests obligatoires

- [x] Chaque claim, consultation et révocation produit une ligne. (Scan, révocation et expiration : L5-05.
      Consultation du dossier : L5-12, **une ligne par moment de lecture**, voir ci-dessous.)

## Règle des consultations (`SHARE_VIEWED`, L5-12, validée en équipe)

- Une ligne par **moment de lecture** du dossier, pas par requête : au plus une par session toutes les
  5 minutes (`doctor/record-view.ts`). Le patient lit **qui** a regardé et **quand** ; il ne doit pas lire
  « 14 consultations » pour une seule ouverture du dossier (plusieurs requêtes, page relue toutes les 30 s).
- Écrite **avant** la lecture, sous verrou de la session : jamais de lecture sans trace, jamais deux lignes
  pour deux requêtes simultanées. Une lecture refusée n'écrit rien.
- La **liste** « Mes patients partagés » (L5-11) n'écrit pas de ligne : elle ne lit pas le dossier
  (seulement la date de la dernière mesure et un score de qualité).

## Fichiers

| Fichier               | Rôle                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `audit.module.ts`     | Déclaration du module NestJS                                                                           |
| `audit.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `audit.service.ts`    | Logique métier et accès base (Prisma)                                                                  |
| `access-log.ts`       | Seule écriture du journal d'accès (actions typées, dans la transaction de l'évènement)                 |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
