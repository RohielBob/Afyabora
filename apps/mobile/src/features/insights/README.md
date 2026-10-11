# Feature `insights` — Analyse et IA

**Lot L3 · Fonctionnalité F6**

Observations, « Voir les mesures concernées », résumé, question libre.

## Tickets

- **L8-11** — Analyse calculée sur le téléphone depuis la base locale — **fait** (données, sans écran)
- **L3-04** — Mobile : écran Analyse avec « Voir les mesures concernées » — **fait**
- **L3-08** — Question libre sur l'historique (IA-4)
- **L3-09** — Mobile : analyse et gabarits calculés hors-ligne depuis la base locale

## Analyse calculée sur le téléphone (L8-11)

- `loadLocalAnalysis(days, now)` lit les mesures **dans la base locale** (SQLite ; magasin en mémoire en
  aperçu web) puis appelle `analyzeLastDays` de `@glyka/analytics` : **la même fonction que l'API**
  (`GET /insights`). Hors-ligne ou en ligne, le patient voit les mêmes chiffres, observations et phrases.
- Période : les N derniers jours **entiers** (minuit à minuit, heure du téléphone, heure d'été comprise) ;
  lecture de la période **et** de la période précédente (comparaison) ; seuils du patient gardés sur le
  téléphone ; aucun appel réseau.
- `useLocalAnalysis(days)` : état `loading` / `error` / `ready`, relu à chaque retour sur l'écran et à chaque
  changement de période ; une lecture plus ancienne n'écrase jamais la plus récente.

| Fichier                            | Rôle                                              |
| ---------------------------------- | ------------------------------------------------- |
| `local-analysis.ts`                | Lecture locale + appel du moteur (sans interface) |
| `useLocalAnalysis.ts`              | Hook pour l'écran « Analyse »                     |
| `__tests__/local-analysis.test.ts` | Jeu de référence, fenêtre lue, seuils, hors-ligne |

## Tests obligatoires (L8-11)

- [x] Lecture de la période et de la période précédente, de minuit à minuit ; minuit ce soir exclu.
- [x] Jeu de référence de L3-01 placé à l'heure du téléphone : 70 / 20 / 10 %, qualité 86, cinq observations,
      leurs preuves et leurs phrases exactes — identique sous 7 fuseaux (Kinshasa, Paris, New York,
      Kiritimati, Katmandou, Santiago, UTC).
- [x] Seuils du patient, moins de 10 mesures, 30 jours ; aucun appel réseau ; base illisible ⇒ erreur.

## Écran « Analyse » (L3-04)

Onglet **Analyse** (`app/(tabs)/insights.tsx`), calculé sur le téléphone (L8-11), donc aussi **sans réseau** :

1. Titre et rappel « calculé sur ce téléphone, même sans réseau ».
2. **Période** 7 / 14 / 30 / 90 jours (30 à l'ouverture, comme l'Accueil) : tout se recalcule.
3. **Résumé** : temps dans la plage cible en grand, barre en dessous / dans la plage / au-dessus qui se
   remplit (≈ 0,4 s), nombre de mesures, qualité des données (icône + score + niveau), et une phrase :
   « Rien de particulier à signaler » ou « N observations à regarder de plus près ».
4. **Observations** triées par gravité (alerte, à surveiller, information ; ordre du moteur à égalité). Chaque
   carte : icône du type, titre, **gravité = icône + libellé + couleur** (bleu information, ambre à surveiller
   et alerte ; jamais le rouge), la phrase (« J'observe… »), le **seuil franchi** dans l'unité du patient et,
   pour une **alerte**, le rappel « Parlez-en à votre professionnel de santé » (CDC F6) + bande à gauche.
5. **« Voir les N mesures concernées »** déplie la liste (chevron qui tourne, lignes qui entrent l'une après
   l'autre) : jour et heure, valeur, badge d'état, contexte ; la plus récente en premier ; 5 d'abord puis
   « Afficher les N autres » ; toucher une ligne ouvre le détail de la mesure (L2-11).
6. **Moins de 10 mesures** : « Pas encore assez de mesures » + combien + « Noter une mesure ». Aucun chiffre.
7. Avertissement « outil d'aide, pas un avis médical ».

**Phrases** : écrites par les traductions (`insights.sentence.*`) à partir des faits du moteur ; en français,
elles sont **mot pour mot** les gabarits du moteur (`renderInsightFr`, donc la même phrase que l'API) : un test le
vérifie pour chaque type. L'anglais est traduit.

**Pourcentages** : `displayPercents` du moteur (parts entières qui font 100), les **mêmes** que l'Accueil et que
les phrases (« Temps dans la cible : 59 % »).

| Fichier                           | Rôle                                                     |
| --------------------------------- | -------------------------------------------------------- |
| `presentation.ts`                 | Ordre, résumé, mesures concernées, seuil franchi, phrase |
| `components/AnalysisSummary.tsx`  | Résumé de la période                                     |
| `components/InsightCard.tsx`      | Une observation et son dépliant                          |
| `components/EvidenceList.tsx`     | « Voir les mesures concernées »                          |
| `components/InsufficientData.tsx` | Moins de 10 mesures                                      |
| `components/AnalysisSkeleton.tsx` | Pendant le calcul                                        |
| `__tests__/presentation.test.ts`  | Tests de la logique et des phrases                       |

## Tests obligatoires (L3-04)

- [x] Ordre par gravité, ordre du moteur à égalité ; résumé (insuffisant / calme / à surveiller, alertes ou non).
- [x] Mesures concernées : de la plus récente à la plus ancienne ; preuve supprimée ignorée ; seuil franchi.
- [x] Phrases françaises = gabarits du moteur (13 cas, dont les 4 créneaux) ; anglais sans clé brute.
- [x] 11 erreurs volontaires (tri, période, résumé, ordre des preuves, seuil, créneau non traduit, arrondis) :
      toutes détectées.
- [x] Aperçu web, clair et sombre, largeur téléphone : observations, dépliant, « Afficher les N autres »,
      ouverture du détail, changement de période, état « pas encore assez de mesures ».

## Fichiers prévus

- `useInsights.ts` : local (analytics + gabarits) puis enrichissement serveur si en ligne (L3-09)
- `AskForm.tsx` (P1)

## Règle importante

Formulations descriptives, jamais de diagnostic ni de dose.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
