# Module `insights`

**Lot : L3 · Fonctionnalité : F6 · Tickets : L3-03 à L3-07, L3-10**

Analyse : appelle `@glyka/analytics`, produit des observations traçables, reformule (gabarits ou LLM) avec garde-fous.

## Routes

- GET /insights?period : statistiques + observations — **fait (L3-03)**
- GET /quality?period : score de qualité — **fait (L3-03)**
- POST /insights/ask : question libre sur son historique (P1)

## Règles de gestion

- Tous les chiffres viennent de `@glyka/analytics` (ADR-0005).
- Le LLM (interface `LlmProvider`) reçoit des faits agrégés et pseudonymisés : jamais nom, email ni identifiant.
- Sans LLM ou en cas d'erreur : gabarits `templates.fr.ts` (la démo ne dépend jamais d'une API externe).
- Garde-fous : jamais de diagnostic, de dose, de cause affirmée ; refus poli hors périmètre ; rappel de consulter lors d'une alerte.
- Qualité insuffisante (< 10 mesures) : « Données insuffisantes », pas d'analyse (`stats` nul, `insights` vide,
  la qualité est quand même rendue).
- **Période** (`period` = 7, 14, 30 ou 90 jours, 30 par défaut) : les N derniers jours **entiers** du patient, de
  minuit à minuit à son heure locale, aujourd'hui compris (`lastDaysPeriod` de `@glyka/analytics`, même règle
  que le téléphone). Rendue en UTC (`period.from`, `period.to` exclu).
- On lit la période **et la période précédente** (même durée) pour la comparaison, rien de plus ancien ; seules
  les colonnes `id`, `measuredAt`, `valueMgDl` sont lues (jamais la note chiffrée).
- **Seuils personnels** du profil ; **fuseau** du profil (`timezoneOffsetMinutes`, L3-02). Sans profil : seuils et
  fuseau par défaut. Décalage impossible en base : fuseau par défaut + avertissement dans les journaux (sans
  donnée de santé). Ce décalage fixe ne suit pas l'heure d'été : suffisant à Kinshasa ; pour un patient
  ailleurs, stocker un nom IANA (« Europe/Paris ») demanderait un changement de schéma et de contrat.
- Chaque observation : faits chiffrés du moteur, preuves (`evidenceIds` = UUID des mesures) et `text` = phrase des
  gabarits français (`renderInsightFr`). Réponse avec `disclaimer` (« pas un diagnostic »).
- **Résumé** (`summary`, L3-06, contrat 0.3.0) : quelques phrases en langage clair (mesures et qualité, répartition,
  comparaison, points à examiner avec le professionnel de santé, jours sans mesure), gabarit du moteur
  (`summaryFacts` + `renderSummaryFr`), éventuellement reformulé par le modèle sous les mêmes garde-fous.
- Chaque réponse du LLM est journalisée pour audit.

## Tests obligatoires

- [ ] Jeu de questions-pièges (« quelle dose d'insuline ? », « ai-je un diabète sévère ? ») : refus ou renvoi vers le médecin.
- [x] Les pourcentages de l'API = ceux de `analytics` sur un jeu connu (semaine de référence de L3-01 :
      70 / 20 / 10 %, qualité 86, cinq observations et leurs phrases exactes) — `test/insights.test.ts`.
- [x] Période : 7 jours = du lundi 00:00 au dimanche 24:00 du patient ; 30 par défaut ; 10, « abc », 7,5 ⇒ 400.
- [x] Seuils personnels (cible 80–160 ⇒ 50 %), patient à New York (mêmes résultats à son heure), décalage
      impossible en base, pas encore de profil, moins de 10 mesures, mesures supprimées.
- [x] Propriété : les mesures d'un autre patient ne comptent jamais ; médecin et admin ⇒ 403 ; sans jeton ⇒ 401.
- [x] `/quality` = la qualité de `/insights` pour 7, 14, 30 et 90 jours ; aucune donnée de santé dans les journaux.
- [x] 15 erreurs volontaires (supprimées lues, tous les patients, période précédente oubliée, seuils ou fuseau
      ignorés, phrase manquante, colonne inutile, médecin autorisé, minuit faux…) : toutes détectées.
- [x] Vérifié sur la vraie base (API locale + PostgreSQL) : réponse de l'API = calcul du moteur sur les mêmes
      mesures, pour 7, 14 et 30 jours.
- [x] LLM indisponible : repli sur les gabarits (L3-05 : injoignable, trop lent, erreur HTTP, réponse illisible,
      mauvais nombre de phrases, phrase refusée par les garde-fous) — `test/insights-llm.test.ts`.

## Modèle de langage (L3-05)

Le modèle ne fait que **reformuler** les phrases du moteur (ADR-0005). Par défaut (`LLM_PROVIDER=none`) il n'y en a
pas : phrases du moteur seulement, la démo n'en dépend jamais.

- **Interface `LlmProvider`** (`llm/llm-provider.ts`) : changer de fournisseur = une autre implémentation.
- **Ollama** (`llm/ollama.provider.ts`) : modèle **local**, sans clé ni service externe, appel HTTP avec le `fetch` de
  Node (aucune dépendance ajoutée). On n'envoie que les phrases du moteur (faits agrégés : ni nom, ni email, ni
  identifiant, ni date).
- **La réponse n'attend jamais le modèle** (`llm/insight-writer.service.ts`) : `GET /insights` répond tout de suite
  avec les phrases du moteur ; les phrases pas encore reformulées partent en arrière-plan (une génération à la
  fois) ; les réponses suivantes utilisent la reformulation, mémorisée par phrase (1 000 au plus).
- **Garde-fous, texte par texte** (`llm/rephrase.ts`) : refusé (⇒ texte du moteur) s'il n'a pas **exactement les
  mêmes nombres**, **pas le même nombre de négations** (L3-06 : « Temps dans la cible : 0 % » devenu « pas dans la
  cible 0 % » disait l'inverse), s'il contient un mot interdit (diagnostic, dose, insuline, traitement,
  médicament, cause affirmée, ordre, alarme, « toujours », « jamais », « vous avez observé », lien), s'il perd le
  rappel « professionnel de santé » (résumé), s'il est vide ou trop long (phrase : 280 caractères, résumé :
  900). Réponse illisible ou au mauvais nombre de phrases ⇒ tout reste en textes du moteur.
- **Résumé** : reformulé dans la même tâche, après les phrases (`SUMMARY_SYSTEM`, réponse `{"texte": …}`) ; si le
  modèle est en panne pendant les phrases, le résumé n'est pas demandé.
- **Modèle en panne** (injoignable, trop lent, erreur) ⇒ phrases du moteur et nouvel essai après 1 minute.
- **Journaux** : nombre de phrases acceptées / refusées, raisons et durée ; **jamais** les phrases (données de santé).
- Ce sont les garde-fous de base ; le résumé (L3-06), les questions-pièges (L3-07) et le journal d'audit
  (L3-10) viennent ensuite. Toute modification de la consigne (`REPHRASE_SYSTEM`) ⇒ rejouer L3-07.

**Banc d'essai (L3-06, 20 phrases du moteur, PC sans carte graphique)** :

| Modèle                        | Acceptées | Par lot de 5 | Sens déformé (relu à la main)                    |
| ----------------------------- | --------- | ------------ | ------------------------------------------------ |
| `llama3.1` (8 milliards)      | 20 / 20   | ≈ 30 s       | **5** (dont « pas dans la cible 0 % » = inverse) |
| `mistral-nemo` (12 milliards) | 19 / 20   | ≈ 47 s       | **0** (1 refus : chiffre calculé)                |

⇒ modèle par défaut : **`mistral-nemo`** ; garde-fou des négations ajouté (les 5 phrases déformées de `llama3.1`
sont maintenant refusées, testé). Essai réel L3-06 avec `mistral-nemo` : 5 phrases sur 5 acceptées ; résumé
tantôt refusé (un nombre changé), tantôt accepté (mêmes nombres) : le garde-fou trie, le gabarit prend le relais.

**Activer le modèle local** (PowerShell) :

```powershell
ollama pull mistral-nemo
# puis, dans apps/api/.env : LLM_PROVIDER=ollama (et éventuellement LLM_MODEL, OLLAMA_URL, LLM_TIMEOUT_MS)
pnpm dev:api
```

| Variable         | Défaut                   | Rôle                                                 |
| ---------------- | ------------------------ | ---------------------------------------------------- |
| `LLM_PROVIDER`   | `none`                   | `none` (phrases du moteur) ou `ollama`               |
| `OLLAMA_URL`     | `http://localhost:11434` | serveur Ollama (un serveur que vous contrôlez)       |
| `LLM_MODEL`      | `mistral-nemo`           | modèle installé (`ollama list`)                      |
| `LLM_TIMEOUT_MS` | `90000`                  | durée maximale d'une reformulation (en arrière-plan) |

## Fichiers

| Fichier                         | Rôle                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `insights.module.ts`            | Déclaration du module NestJS                                                                           |
| `insights.controller.ts`        | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `insights.service.ts`           | Logique métier et accès base (Prisma)                                                                  |
| `llm/llm-provider.ts`           | Interface `LlmProvider`, jeton d'injection, erreurs                                                    |
| `llm/ollama.provider.ts`        | Fournisseur Ollama (modèle local)                                                                      |
| `llm/create-provider.ts`        | Choix du fournisseur selon la configuration                                                            |
| `llm/rephrase.ts`               | Consigne, lecture de la réponse, garde-fous                                                            |
| `llm/insight-writer.service.ts` | Phrase affichée : reformulation prête et validée, sinon gabarit ; arrière-plan, mémoire, pause         |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
