# Module `auth`

**Lot : L1 · Fonctionnalité : F1 · Tickets : L1-01 à L1-04**

Comptes, sessions et sécurité des accès (patients et médecins).

## Routes

- POST /auth/register : inscription patient (consentement obligatoire) — **fait (L1-01)**
- POST /auth/register-doctor : inscription médecin (statut « en attente ») — **fait (L1-01)**
- POST /auth/verify-email — **fait (L1-01)**
- POST /auth/login · POST /auth/refresh · POST /auth/logout — **faits (L1-02)**
- POST /auth/forgot-password · POST /auth/reset-password — **faits (L1-03)**

## Règles de gestion

- Mot de passe : 12 caractères minimum, haché avec Argon2id.
- Email vérifié obligatoire avant la première connexion.
- 5 échecs en 10 minutes : compte verrouillé temporairement.
- Jeton d'accès 15 min ; jeton de rafraîchissement rotatif, stocké haché (`RefreshToken`), détection de réutilisation (famille révoquée).
- Un médecin `PENDING` ne peut pas utiliser `/shares/claim`.
- Messages d'erreur identiques pour « email inconnu » et « mauvais mot de passe ».

### Mot de passe oublié (L1-03)

- `forgot-password` : **toujours 202, même message**, que le compte existe ou non ; un email n'est envoyé que si le compte existe. Une nouvelle demande annule le lien précédent.
- Lien : `PORTAL_URL/reset-password?token=…` (page portail à créer, comme `/verify-email`). Jeton opaque de 32 octets, **seul son hash est stocké** (`EmailToken`, type `RESET_PASSWORD`), valable **1 heure**, **usage unique**.
- `reset-password` : nouveau mot de passe ≥ 12 caractères (argon2id) ; **toutes les sessions du compte sont révoquées** ; un verrouillage en cours est levé ; un compte jamais vérifié devient vérifié (recevoir le lien prouve qu'on lit cette boîte mail).
- Un mot de passe invalide (400) ne consomme **pas** le lien. Jeton inconnu, expiré, déjà utilisé ou de vérification d'email : 400 `TOKEN_INVALID`.
- Limite : un jeton d'accès déjà émis reste valable jusqu'à son expiration (15 min au plus) ; c'est le refresh qui est coupé tout de suite.
- Limites par IP : 5 demandes / min, 10 réinitialisations / min.

### Connexion et sessions (L1-02)

- `login` : identique (401, même message) pour un email inconnu et un mauvais mot de passe ; pour un email inconnu, un calcul argon2 est fait quand même (même durée de réponse). L'email non vérifié (403 `EMAIL_NOT_VERIFIED`) n'est signalé qu'avec le **bon** mot de passe.
- Verrouillage : au **5e échec en 10 minutes**, compte verrouillé **10 minutes** (429 `ACCOUNT_LOCKED`, `retryAfterSeconds` et en-tête `Retry-After`). Pendant le verrouillage, même le bon mot de passe est refusé, sans le vérifier. Le schéma n'a pas de colonne « date du premier échec » : la fenêtre utilise `updatedAt` (mis à jour à chaque échec), donc aucune migration. Une connexion réussie remet le compteur à zéro.
- Jetons : accès = JWT `{ sub, role }` de 15 min (`ACCESS_TOKEN_TTL_SECONDS`) ; rafraîchissement = 32 octets aléatoires, haché en base, 30 jours (`REFRESH_TOKEN_TTL_DAYS`), une « famille » par connexion.
- `refresh` : usage unique (consommation atomique). Présenter un jeton déjà utilisé ou révoqué **révoque toute la famille** (le voleur et l'utilisateur doivent se reconnecter) ; les autres sessions du même compte ne sont pas touchées. ⚠️ Mobile (L1-07) : ne jamais lancer deux `refresh` en parallèle, sinon le second est vu comme une réutilisation.
- `logout` : exige le jeton d'accès ; révoque la famille du jeton fourni **s'il appartient à l'utilisateur connecté** ; toujours 204 (idempotent).
- Limites par IP : 10 connexions / min, 30 rafraîchissements / min.

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

- [x] Connexion refusée sans email vérifié (`test/auth-session.test.ts`).
- [x] Mot de passe de 8 caractères refusé (à l'inscription, `test/auth-register.test.ts`).
- [x] Verrouillage après 5 échecs (`test/auth-session.test.ts`).
- [x] Rotation du refresh : l'ancien jeton ne fonctionne plus (`test/auth-session.test.ts`).
- [x] Réutilisation d'un refresh révoque toute la famille (`test/auth-session.test.ts`).
- [x] (L1-01) Inscription : compte non vérifié, hash argon2id, consentement enregistré, seul le hash du jeton en base, lien valable 24 h.
- [x] (L1-01) Consentement absent ou `false` refusé ; email invalide refusé ; email normalisé en minuscules.
- [x] (L1-01) Adresse existante (vérifiée ou non) : même réponse 202, pas de doublon, mot de passe inchangé.
- [x] (L1-01) Vérification : jeton valide accepté une seule fois ; expiré, inconnu ou de mauvais type refusé (`TOKEN_INVALID`).
- [x] (L1-01) Inscription médecin : profil `PENDING` ; numéro d'ordre obligatoire.
- [x] (L1-01) Routes publiques ; 429 à la 6e inscription en une minute ; panne SMTP sans erreur visible.
- [x] (L1-02) Même 401 pour « email inconnu » et « mauvais mot de passe » ; 403 `EMAIL_NOT_VERIFIED` seulement avec le bon mot de passe.
- [x] (L1-02) JWT d'accès : identifiant + rôle, 15 min ; refresh stocké haché ; réponse avec `profileCompleted` et statut médecin.
- [x] (L1-02) Bon mot de passe refusé pendant le verrouillage ; `Retry-After` ; seuls les échecs des 10 dernières minutes comptent.
- [x] (L1-02) Une réutilisation ne touche pas les autres sessions ; refresh expiré / inconnu refusé.
- [x] (L1-02) Déconnexion : jeton d'accès exigé ; session révoquée ; impossible de fermer la session d'un autre.
- [x] (L1-03) Mot de passe oublié : même 202 pour un compte inconnu, sans email ; lien 1 h, hash seul en base ; nouvelle demande = ancien lien annulé ; 429 à la 6e demande.
- [x] (L1-03) Réinitialisation : seul le nouveau mot de passe fonctionne ; toutes les sessions du compte révoquées (pas celles des autres) ; verrouillage levé ; compte non vérifié vérifié.
- [x] (L1-03) Lien à usage unique, expiré refusé, jeton de vérification refusé ; mot de passe trop court refusé sans consommer le lien.

## Fichiers

| Fichier               | Rôle                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `auth.module.ts`      | Déclaration du module NestJS                                                                           |
| `auth.controller.ts`  | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `auth.service.ts`     | Inscription et vérification d'email (L1-01)                                                            |
| `session.service.ts`  | Connexion, rafraîchissement rotatif, déconnexion, verrouillage (L1-02)                                 |
| `password.service.ts` | Mot de passe oublié et réinitialisation (L1-03)                                                        |
| `auth.mails.ts`       | Contenu des emails du module (texte + HTML, nom « Afyabora »)                                          |

Service d'envoi partagé : `src/common/mail/mail.service.ts` (SMTP ; Mailpit en local, http://localhost:8025).

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
