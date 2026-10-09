# ADR-0002 — Glycémie stockée en mg/dL entier

- **Statut :** Accepté — réunion du 2026-10-09 (ticket L0-09)
- **Date :** 2026-10-04

## Contexte

Les patients et les appareils utilisent g/L, mg/dL ou mmol/L. Les conversions flottantes créent des erreurs d'arrondi et des comparaisons fausses (seuils, doublons).

## Décision

Toute glycémie est **stockée en mg/dL, en entier** (`valueMgDl`). On conserve aussi la **valeur d'origine et son unité** pour la provenance et l'affichage fidèle. 1 g/L = 100 mg/dL ; 1 mmol/L ≈ 18,016 mg/dL.

## Conséquences

- 1,48 g/L = 148 mg/dL **exactement** ; changer l'unité d'affichage ne modifie jamais les données.
- Les seuils, statistiques et détection de doublons travaillent tous en mg/dL.
- Les mmol/L sont arrondis à l'entier en stockage : acceptable pour un carnet de suivi, la valeur d'origine est gardée.
- Bornes plausibles : 20 à 600 mg/dL (`isPlausible`).
