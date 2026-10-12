# Checklist de sécurité

À relire au **point sécurité du jour 7** et avant la démonstration. Cocher uniquement ce qui est **vérifié par un test ou une relecture de code**.

## Authentification et sessions

- [ ] Mots de passe hachés en Argon2id ; jamais dans les logs ni dans les réponses
- [ ] Email vérifié obligatoire avant connexion
- [ ] Verrouillage après 5 échecs en 10 minutes
- [ ] Refresh rotatif ; la réutilisation d'un ancien jeton révoque la famille
- [ ] Messages d'erreur identiques pour « email inconnu » et « mauvais mot de passe »
- [ ] Jetons stockés dans SecureStore (mobile) ; aucune donnée patient dans `localStorage` (portail)

## Autorisation

- [ ] Toute route vérifie le **rôle** ET la **propriété** de la donnée (un patient ne lit jamais les données d'un autre)
- [ ] Un médecin `PENDING` ou `REJECTED` ne peut pas utiliser `/shares/claim`

## Partage par QR (ADR-0003) — tests automatiques obligatoires (L5-14)

- [ ] Le même QR scanné deux fois : le second est refusé
- [ ] Un jeton de plus de 60 s est refusé
- [ ] Deux scans simultanés : un seul réussit
- [ ] Après expiration : 403 sur toutes les routes médecin
- [ ] Après révocation : accès coupé en moins de 5 s
- [ ] Une catégorie décochée n'est jamais renvoyée (notes personnelles comprises)
- [ ] Seul le hash du jeton est en base
- [ ] Limitation de débit active sur `/shares/claim` et `/e/:token`
- [ ] Chaque étape écrit dans le journal d'accès

## Données

- [ ] Notes personnelles chiffrées (AES-256-GCM)
- [ ] Entrées validées côté serveur avec les schémas Zod partagés
- [ ] Aucune donnée de santé dans les logs, les messages d'erreur, les URL
- [ ] Base locale mobile : chiffrement évalué (SQLCipher) et décision notée dans l'ADR-0004
- [ ] **Données de démo uniquement fictives**

## Notifications et IA

- [ ] Aucune valeur de santé dans le texte d'une notification par défaut
- [x] Le modèle de langage ne reçoit ni nom, ni email, ni identifiant (L3-05 : seulement les phrases du
      moteur, testé dans `apps/api/test/insights-llm.test.ts`)
- [x] Jeu de questions-pièges : aucun diagnostic, aucune dose, refus poli (L3-07, filtre des questions ;
      revérifié en conversation avec l'assistant : L9-08, `apps/api/test/assistant-traps.test.ts`)
- [x] Réponses du modèle journalisées pour audit : textes chiffrés, aucun identifiant de patient,
      conservation 90 jours (L3-10)

## Assistant « Afyabora » (lot L9, ADR-0005 complétée)

Chaque point est vérifié par les tests cités (API : `apps/api/test/`, mobile : `apps/mobile/src/features/assistant/__tests__/`).

- [x] Routes `/assistant/*` réservées au rôle **PATIENT** (403 médecin et admin) ; la conversation d'un autre
      patient est « introuvable » (404) ; un identifiant de question rejoué par un autre patient ⇒ 409 sans rien
      renvoyer — `assistant-conversations.test.ts`
- [x] Le médecin n'a **jamais** accès aux conversations : aucune route pour lui (403), ni QR, ni portail —
      `assistant-conversations.test.ts`
- [x] Questions, réponses et aperçu **chiffrés** (AES-256-GCM) ; **aucun texte** dans les journaux (seulement
      la nature de la réponse) — `assistant-conversations.test.ts`
- [x] Quota : 20 questions par heure et par patient (429 + délai) — `assistant-conversations.test.ts`
- [x] **Effacement réel** d'une conversation ou de toutes, messages compris — `assistant-conversations.test.ts` ;
      avec le compte : cascade en base (`onDelete: Cascade`, vérifiée sur la vraie base en L9-05) ; **aucune
      copie sur le téléphone** (relecture du code mobile : le serveur est la seule source)
- [x] Le modèle de langage ne reçoit **que le texte déjà vérifié** (phrases du moteur ou extrait de fiche) :
      **jamais la question**, ni nom, ni identifiant ; citation et rappel remis par le code —
      `assistant-rewrite.test.ts`, `assistant-conversations.test.ts`
- [x] Réponse du modèle **vérifiée** avant affichage (nombres, négations, mots interdits, diagnostic ou cause
      inventés, fausse source, langue, longueur, phrase inventée), sinon texte vérifié ; 22 erreurs volontaires
      du modèle toutes refusées — `assistant-rewrite.test.ts`, `assistant-traps.test.ts`
- [x] Délai de **2 minutes** au plus ; panne du modèle ⇒ texte vérifié ; démarrage sur une base non migrée sans
      arrêter l'API — `assistant-rewrite.test.ts`
- [x] **Urgence** : réponse immédiate sans passer par le modèle, avec seulement les numéros enregistrés par le
      patient (**aucun numéro deviné**) — `assistant-answers.test.ts`, `presentation.test.ts` (mobile)
- [x] Dose, traitement, diagnostic, prédiction, détournement ⇒ **refus poli**, y compris en **plusieurs
      messages** (2 questions précédentes, 30 min) ; tout piège non refusé finit en « pas de réponse sûre »,
      jamais en réponse sur les mesures ou une fiche — `assistant-traps.test.ts`
- [x] Fiches : texte relu par un médecin (empreinte de relecture), **seules les fiches validées servies en
      production** ; relecteur **anonyme** à sa demande (son nom n'est nulle part dans le dépôt) —
      `assistant-knowledge.test.ts`, `assistant-answers.test.ts`
- [x] Appels au modèle journalisés pour audit (`ASSISTANT`), textes chiffrés, aucun identifiant de patient —
      `assistant-rewrite.test.ts`
- [ ] À décider : inclure les conversations dans l'export des données (`GET /me/export`) — demanderait un
      changement de contrat

## Dépôt

- [ ] Aucun secret dans Git (`.env` ignorés) ; secrets de démo changés après la présentation
- [ ] CI verte ; pas de dépendance abandonnée ou vulnérable connue (`pnpm audit`)
