# Feature `dashboard` — Tableau de bord

**Lot L2 · Fonctionnalité F3**

Dernière mesure, graphique, statistiques, qualité des données, comparaison de période.

## Tickets

- **L2-05** — Mobile : tableau de bord — dernière mesure et badge d'état (forme + libellé + couleur) — **fait**
- **L2-06** — Mobile : graphique d'évolution 7/14/30/90 jours avec bande cible — **fait**
- **L2-07** — Mobile : statistiques et comparaison avec la période précédente — **fait**
- **L2-08** — Mobile : score de qualité des données et phrase d'explication
- **L8-11** — Tableau de bord et analyse calculés depuis la base locale (moteur sur le téléphone)

## Dernière mesure (L2-05)

Onglet **Accueil** (`app/(tabs)/index.tsx`), de haut en bas :

1. Date du jour et salutation (« Bonjour » / « Bonsoir » à partir de 18 h).
2. **Carte « Dernière mesure »** : valeur en grand dans l'unité préférée, **badge d'état** (couleur +
   symbole + libellé) calculé avec **les seuils du patient** (gardés sur le téléphone, L2-04), contexte,
   jour et heure (« Aujourd'hui, 08:30 », « Hier, 22:10 », sinon la date), et ancienneté (« Il y a 2 h »).
   Une bande à gauche reprend la couleur de l'état (repère, jamais le seul). Bouton « Nouvelle mesure ».
3. **Aucune mesure** : carte d'invitation « Noter ma première mesure ».
4. **Indicateur de synchronisation** : « Tout est à jour » ou « 3 mesures en attente de synchronisation ».
5. Avertissement « outil d'aide, pas un avis médical » (version courte).

Tout est lu sur le téléphone (base locale), **sans réseau**, et relu à chaque retour sur l'onglet (ex. après
une saisie). Pendant la lecture : squelette de la carte ; base illisible : message + « Réessayer ».

| Fichier                            | Rôle                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `latest.ts`                        | Logique : jour (calendrier), ancienneté, salutation         |
| `useDashboard.ts`                  | Lecture locale : dernière mesure, en attente, seuils, unité |
| `components/LatestReading.tsx`     | Carte « Dernière mesure »                                   |
| `components/EmptyLatest.tsx`       | Aucune mesure encore                                        |
| `components/SyncStatus.tsx`        | « Tout est à jour » / « N en attente »                      |
| `components/DashboardSkeleton.tsx` | Squelette pendant la lecture                                |
| `__tests__/latest.test.ts`         | Tests de la logique                                         |

## Tests obligatoires (L2-05)

- [x] Jour : aujourd'hui / hier / avant, en jours du **calendrier** (23 h 50 la veille = « hier »).
- [x] Ancienneté : à l'instant (et horloge un peu en avance), minutes, heures, jours.
- [x] Salutation : bonjour avant 18 h, bonsoir à partir de 18 h et la nuit.

## Graphique d'évolution (L2-06)

Sous la dernière mesure, une carte « Évolution » (`components/GlucoseChart.tsx`, react-native-svg déjà
présent, aucune dépendance ajoutée) :

- **Périodes 7 / 14 / 30 / 90 jours** (30 à l'ouverture, comme le scénario de démo), en jours du
  calendrier : « 7 jours » = aujourd'hui + les 6 jours d'avant.
- **Bande verte = plage cible du patient** ; graduations rondes **dans son unité** (0,50 · 1,00 g/L ;
  2,5 · 5,0 mmol/L ; 50 · 100 mg/dL) ; l'axe contient toujours la bande et toutes les mesures, jamais
  sous zéro.
- **Chaque mesure a une forme selon son état** (● dans la plage, ▲ au-dessus, ▼ en dessous, plus grande
  pour très haut / très bas) et sa couleur : jamais la couleur seule ; légende sous le graphique.
- **Courbe coupée après 2 jours sans mesure** : on ne dessine pas une tendance inventée.
- **Interactif** : toucher ou glisser le doigt sélectionne la mesure la plus proche (trait vertical, point
  agrandi, détail au-dessus : valeur, badge d'état, contexte, jour et heure). Un geste surtout vertical
  laisse l'écran défiler. Lecteur d'écran : balayer vers le haut / le bas passe d'une mesure à l'autre.
- **Animations** : la courbe se trace (≈ 0,4 s) puis les points apparaissent en fondu ; changer de période
  redessine ; « réduire les animations » : affichage direct.
- Beaucoup de mesures (plus de 120 affichées, ex. 90 jours) : points et courbe plus fins.
- Données : une seule lecture locale des 90 derniers jours (`localMeasurements.between`), chaque période
  filtre ensuite en mémoire.

| Fichier                       | Rôle                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `chart.ts`                    | Logique : périodes, axe vertical, repères du temps, coupures, toucher |
| `components/GlucoseChart.tsx` | Dessin, animations, interaction, légende                              |
| `__tests__/chart.test.ts`     | Tests de la logique                                                   |

## Tests obligatoires (L2-06)

- [x] Période : 7 jours = aujourd'hui + 6 jours depuis minuit ; tolérance de 5 min dans le futur.
- [x] Axe : pas ronds, plage cible toujours visible, unité du patient, jamais sous zéro.
- [x] Repères du temps : chaque jour (7 j) … chaque semaine en partant d'aujourd'hui (30 j).
- [x] Courbe coupée après plus de 2 jours sans mesure.
- [x] Mesure la plus proche du doigt ; tracé et longueur (animation de dessin).

## Statistiques (L2-07)

Carte « Statistiques » sous le graphique (`components/StatsCard.tsx`), **pour la même période que le
graphique** : la période est choisie par l'écran et partagée (CDC : « changer de période met à jour tous les
chiffres »).

- Chiffres calculés par le moteur **`@glyka/analytics`** (`computeRangeStats`, ADR-0005) ; `stats.ts` ne
  fait que choisir les mesures et préparer l'affichage.
- **Moins de 10 mesures** sur la période : « Données insuffisantes » + combien il en manque, aucun
  pourcentage (CDC F3).
- **Répartition** en dessous / dans la plage / au-dessus : barre qui se remplit (≈ 0,4 s) + pourcentages
  qui font toujours 100 (plus grand reste), avec symbole ▼ ● ▲ et libellé.
- **Moyenne, écart-type, variabilité** (coefficient de variation) dans l'unité du patient.
- **Comparaison** avec les N jours précédents (même durée, sans recouvrement ; elle aussi ≥ 10 mesures) :
  temps dans la cible en points (« stable » sous 5 points), moyenne (« stable » sous 5 %). Flèches ↑ ↓ →
  **neutres** (ni vert ni rouge) : on décrit, on ne juge pas.
- Une seule lecture locale de 180 jours (90 + les 90 d'avant) pour toutes les périodes.

| Fichier                    | Rôle                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `stats.ts`                 | Période précédente, règle des 10 mesures, pourcentages, flèches     |
| `components/StatsCard.tsx` | Carte : répartition, tuiles, comparaison, « Données insuffisantes » |
| `__tests__/stats.test.ts`  | Tests de la logique                                                 |

## Tests obligatoires (L2-07)

- [x] Période précédente : les N jours juste avant, sans recouvrement.
- [x] Moins de 10 mesures : pas de statistiques (nombre connu) ; période précédente aussi soumise à la règle.
- [x] Statistiques du moteur (moyenne, temps dans / au-dessus de la cible).
- [x] Pourcentages qui font 100.
- [x] Comparaison : hausse / baisse / stable, seuils exacts (5 points, 5 %).

## Fichiers prévus (suite)

- `QualityCard.tsx`
- `useLocalAnalysis.ts` : lit SQLite → GlucosePoint[] → @glyka/analytics

## Règle importante

Tout est calculé depuis la base LOCALE : le tableau de bord fonctionne hors-ligne.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
