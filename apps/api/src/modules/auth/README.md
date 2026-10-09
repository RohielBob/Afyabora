# Module `auth`

**Lot : L1 · Fonctionnalité : F1 · Tickets : L1-01 à L1-04**

Comptes, sessions et sécurité des accès (patients et médecins).

## Routes

- POST /auth/register : inscription patient (consentement obligatoire) — **fait (L1-01)**
- POST /auth/register-doctor : inscription médecin (statut « en attente ») — **fait (L1-01)**
- POST /auth/verify-email — **fait (L1-01)** · POST /auth/login · POST /auth/refresh · POST /auth/logout
- POST /auth/forgot-password · POST /auth/reset-password

## Règles de gestion

- Mot de passe : 12 caractères minimum, haché avec Argon2id.
- Email vérifié obligatoire avant la première connexion.
- 5 échecs en 10 minutes : compte verrouillé temporairement.
- Jeton d'accès 15 min ; jeton de rafraîchissement rotatif, stocké haché (`RefreshToken`), détection de réutilisation (famille révoquée).
- Un médecin `PENDING` ne peut pas utiliser `/shares/claim`.
- Messages d'erreur identiques pour « email inconnu » et « mauvais mot de passe ».

### Inscription et vérification d'email (L1-01, décisions du 2026-10-09)

- `register` et `register-doctor` répondent **toujours 202 avec le même message**, que l'adresse soit nouvelle, déjà inscrite ou déjà vérifiée (pas d'énumération de comptes). Le mot de passe est haché dans tous les cas pour que le temps de réponse ne trahisse rien.
- Adresse inscrite mais non vérifiée : un **nouveau lien** est envoyé et l'ancien est supprimé ; le mot de passe existant n'est **pas** modifié. C'est aussi la façon de « renvoyer le lien » (pas de route dédiée dans le contrat).
- Adresse déjà vérifiée : rien n'est fait, aucun email.
- Lien : `PORTAL_URL/verify-email?token=…` (page portail à créer). Jeton opaque de 32 octets, **seul son hash SHA-256 est stocké** (`EmailToken`), valable **24 h**, **usage unique** (consommation atomique).
- Jeton inconnu, expiré, déjà utilisé ou d'un autre type : 400 `TOKEN_INVALID`, message identique.
- Envoi de l'email non bloquant : une panne SMTP ne change pas la réponse ; elle est journalisée sans adresse ni jeton.
- Limites par IP : 5 inscriptions / min, 10 vérifications / min (429 au-delà).
- Médecin : `DoctorProfile` créé avec `verificationStatus = PENDING` (approbation : L1-12).
- Le profil patient (nom, date de naissance, seuils…) n'est pas créé à l'inscription : c'est l'assistant de profil (L1-05).

## Tests obligatoires

- [ ] Connexion refusée sans email vérifié.
- [x] Mot de passe de 8 caractères refusé (à l'inscription, `test/auth-register.test.ts`).
- [ ] Verrouillage après 5 échecs.
- [ ] Rotation du refresh : l'ancien jeton ne fonctionne plus.
- [ ] Réutilisation d'un refresh révoque toute la famille.
- [x] (L1-01) Inscription : compte non vérifié, hash argon2id, consentement enregistré, seul le hash du jeton en base, lien valable 24 h.
- [x] (L1-01) Consentement absent ou `false` refusé ; email invalide refusé ; email normalisé en minuscules.
- [x] (L1-01) Adresse existante (vérifiée ou non) : même réponse 202, pas de doublon, mot de passe inchangé.
- [x] (L1-01) Vérification : jeton valide accepté une seule fois ; expiré, inconnu ou de mauvais type refusé (`TOKEN_INVALID`).
- [x] (L1-01) Inscription médecin : profil `PENDING` ; numéro d'ordre obligatoire.
- [x] (L1-01) Routes publiques ; 429 à la 6e inscription en une minute ; panne SMTP sans erreur visible.

## Fichiers

| Fichier              | Rôle                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `auth.module.ts`     | Déclaration du module NestJS                                                                           |
| `auth.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `auth.service.ts`    | Logique métier et accès base (Prisma)                                                                  |
| `auth.mails.ts`      | Contenu des emails du module (texte + HTML, nom « Afyabora »)                                          |

Service d'envoi partagé : `src/common/mail/mail.service.ts` (SMTP ; Mailpit en local, http://localhost:8025).

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
