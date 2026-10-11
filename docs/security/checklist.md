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
      à revérifier avec la question libre / l'assistant)
- [x] Réponses du modèle journalisées pour audit : textes chiffrés, aucun identifiant de patient,
      conservation 90 jours (L3-10)

## Dépôt

- [ ] Aucun secret dans Git (`.env` ignorés) ; secrets de démo changés après la présentation
- [ ] CI verte ; pas de dépendance abandonnée ou vulnérable connue (`pnpm audit`)
