# Jeu de données de référence du moteur d'analyse (L3-01)

Critère du cahier des charges (F6) : _« avec un jeu de test connu, le moteur retrouve exactement les
pourcentages attendus »_. Ce dossier contient ce jeu connu, ses résultats attendus et la preuve que ces
résultats sont justes.

| Fichier             | Rôle                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `reference-data.ts` | les mesures du jeu et les résultats attendus (`EXPECTED`), avec le calcul en commentaire |
| `reference.test.ts` | confronte le moteur au jeu : valeurs exactes, chaque règle à sa limite, déterminisme     |
| `oracle.py`         | recalcule les attendus **indépendamment** (Python, à partir des règles du CDC)           |

## Comment les attendus ont été validés

1. **À la main**, à partir des règles du cahier des charges (§5.2, §5.3, §5.4), **sans** regarder le code.
2. **Par un second calcul indépendant** : `oracle.py` applique les mêmes règles en Python avec le module
   standard `statistics`. Il s'arrête en erreur si un résultat diffère.

```powershell
python packages/analytics/test/reference/oracle.py
```

> « Validé » veut dire **juste du point de vue du calcul**. Les seuils eux-mêmes (70–180 mg/dL, etc.)
> restent à faire valider par un professionnel de santé (CDC §5.4).

## La semaine de référence

Du lundi 28 septembre au dimanche 4 octobre 2026, heure de Kinshasa (UTC+1). Valeurs en mg/dL ; seuils
par défaut : cible 70–180, très bas < 54.

| Jour | Matin 07 h | Midi 13 h | Soir 19 h | Nuit 23 h | Remarque                              |
| ---- | ---------: | --------: | --------: | --------: | ------------------------------------- |
| J1   |         95 |       140 |       175 |       120 |                                       |
| J2   |     **70** |       150 |   **180** |       110 | bornes : 70 et 180 sont DANS la cible |
| J3   |          — |         — |         — |         — | aucune mesure                         |
| J4   |     **65** |   **190** |   **240** |   **200** | 65 bas ; 190-240-200 : série haute    |
| J5   |        100 |       160 |   **210** |       130 | 210 haut mais isolé                   |
| J6   |          — |         — |         — |         — | aucune mesure                         |
| J7   |     **50** |       145 |       170 |       125 | 50 : très bas                         |

Semaine précédente (21–25 septembre, matin et soir) : 120/200, 110/210, 130/220, 100/190, 140/230.
Une mesure de 400 le 5 octobre (après la période) vérifie que rien hors période n'est compté.

## Résultats attendus et calcul

| Indicateur               | Attendu                     | Calcul                                                  |
| ------------------------ | --------------------------- | ------------------------------------------------------- |
| Mesures                  | 20                          | 5 jours × 4                                             |
| Dans la cible            | **70 %**                    | 14 / 20                                                 |
| Au-dessus                | **20 %**                    | 190, 240, 200, 210 → 4 / 20                             |
| En dessous               | **10 %**                    | 65, 50 → 2 / 20                                         |
| Moyenne                  | 141,25 mg/dL                | 2 825 / 20                                              |
| Écart-type (n − 1)       | 50,83 mg/dL                 | `statistics.stdev`                                      |
| Coefficient de variation | 35,99 %                     | 50,83 / 141,25                                          |
| Médiane                  | 142,5                       | (140 + 145) / 2                                         |
| Qualité                  | **86**, « Bonne »           | 0,5 × 5/7 + 0,3 × min(1, 4/3) + 0,2 × 1                 |
| Hypoglycémies répétées   | 2, **alerte**               | 65 et 50 ; 50 < 54                                      |
| Série haute              | 3 mesures                   | J4 midi, soir, nuit                                     |
| Créneau                  | **soir** : 40 % contre 20 % | 2 / 5 le soir ; écart 20 points = pile la limite (≥ 20) |
| Anomalie                 | aucune                      | 5 mesures par créneau, il en faut 8                     |
| Données manquantes       | 2 jours sur 7               | J3, J6                                                  |
| Comparaison              | 70 % contre 50 %            | précédente : 5 / 10 dans la cible                       |

Le test vérifie aussi les **phrases exactes** des gabarits et que chaque « mesure concernée » existe et
justifie bien l'observation (traçabilité).

## Chaque règle à sa limite

Le test change **une seule valeur** du jeu et vérifie la conséquence : 54 n'est pas « très bas » (attention
au lieu d'alerte) ; 180 coupe une série haute ; un écart de créneau de 20 points est signalé, de 5 non ;
moins de 5 mesures dans un créneau ⇒ rien ; 9 mesures dans la période ⇒ aucune analyse, 10 ⇒ analyse ;
9 mesures dans la période précédente ⇒ pas de comparaison ; une hypoglycémie d'il y a plus de 7 jours ne
compte pas.

Autres jeux du même fichier :

- **Anomalies** : neuf matins stables (96 à 104) + une dernière valeur. Médiane 100,5 ; MAD 2.
  Score z modifié = 0,6745 × (x − 100,5) / 2 : **111 → 3,54 signalé**, **110 → 3,20 non signalé**.
  Avec 7 matins seulement, rien n'est calculé (il faut 8 mesures par créneau).
- **Qualité** : quatre cas tabulés (100, 55, 60, 15) ; fraîcheur 100 / 75 / 0 à 1 / 2,5 / 7 jours ; niveaux
  75 « Bonne », 74 et 40 « Partielle », 39 « Insuffisante » ; jours comptés en heure locale.
- **Statistiques** : écart-type du jeu classique 2, 4, 4, 4, 5, 5, 7, 9 (2,138) ; bornes 53, 54, 69, 70,
  180, 181, 250, 251 ; seuils personnels du patient (cible 80–160 ⇒ 50 % dans la cible).
- **Gabarits** : aucune phrase ne contient « diagnostic », « dose », « insuline », « traitement »,
  « il faut », « à cause »… ; les quatre créneaux sont traduits.

## Défauts trouvés par ce jeu (corrigés dans `src/insights.ts`)

1. **Résultat dépendant de l'ordre d'arrivée des mesures.** La liste « Voir les mesures concernées »
   suivait l'ordre de la base ou de la synchronisation : le même historique pouvait donner
   `[J7, J4]` ou `[J4, J7]`. `analyze()` trie maintenant les mesures par date (puis par identifiant).
2. **Comparaison avec une période précédente presque vide.** Une seule mesure suffisait pour afficher
   « période précédente : 100 % ». La période précédente suit maintenant la même règle que l'analyse :
   au moins 10 mesures (comme l'écran Statistiques du mobile, L2-07).

## Limite connue (documentée, non modifiée)

Si plus de la moitié des mesures d'un créneau sont **identiques**, la MAD vaut 0 et le score z ne peut
pas être calculé (division par zéro) : le moteur ne signale alors **aucune** anomalie dans ce créneau
plutôt qu'un score faux. C'est rare avec un vrai lecteur (les valeurs varient), mais à garder en tête.

## Contrôle de la qualité des tests

16 erreurs ont été introduites volontairement dans le moteur, une à la fois (tri retiré, « au moins
20 points » changé en « plus de 20 », 180 compté haut, 54 compté très bas, fenêtre de 7 jours ignorée,
poids de la qualité inversés, jours comptés en UTC, écart-type sur n au lieu de n − 1, etc.). **Chacune a fait échouer ce jeu de
tests**, puis le code d'origine a été remis.
