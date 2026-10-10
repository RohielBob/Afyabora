# Feature `measurements` — Saisie et gestion des mesures

**Lot L2 · Fonctionnalité F2**

Saisie rapide, confirmation de valeur inhabituelle, message de sécurité, édition, suppression.

## Tickets

- **L2-03** — Mobile : saisie rapide d'une mesure (valeur, unité, date, contexte), écriture locale d'abord — **fait**
- **L2-04** — Mobile : confirmation de valeur inhabituelle + message de sécurité hypo/hyper — **fait**
- **L2-11** — Mobile : modification et suppression d'une mesure
- **L4-09** — Badge de provenance (saisie, import, appareil) sur mesure, chronologie et portail

## Saisie rapide (L2-03)

Bouton **« + »** rouge au centre de la barre d'onglets (toujours accessible, CDC F2), qui ouvre
`app/measurement/new.tsx` (fenêtre qui monte du bas). L'ordre de l'écran suit l'ordre de la saisie :

1. **Valeur** : grand champ, clavier numérique ouvert tout de suite ; conversion en direct dessous
   (« soit 148 mg/dL · 8,2 mmol/L »).
2. **Unité** : g/L, mg/dL, mmol/L. **Changer d'unité convertit la valeur tapée** (CDC F2 : « 1,48 g/L
   puis mg/dL affiche 148 mg/dL »). L'unité est mémorisée : celle du profil (assistant L1-08), puis la
   dernière utilisée (g/L par défaut).
3. **Quand ?** : maintenant (par défaut), −30 min, −1 h, ou « Autre » : jour (aujourd'hui, hier,
   avant-hier) et heure réglable par pas de 5 min / 1 h. Pas de sélecteur natif (aucune dépendance
   ajoutée).
4. **Contexte** (obligatoire) : à jeun, avant repas, après repas, au coucher, la nuit, autre.
5. **Note** facultative (500 caractères).

Règles (les mêmes que le serveur, L2-01) :

- valeur > 0, décimales adaptées à l'unité (g/L : 2, mmol/L : 1, mg/dL : 0) ;
- **date plus de 5 minutes dans le futur refusée** ;
- hors 20–600 mg/dL : confirmation obligatoire (voir L2-04 ci-dessous) ;
- **doublon exact** (même minute, même valeur) : avertissement, « Enregistrer quand même » possible.

Enregistrement **sur le téléphone d'abord** (ADR-0004) : `localMeasurements.save` écrit la mesure et son
opération de synchronisation dans la même transaction (`db/repositories/measurements.repo.ts`).
L'envoi au serveur viendra avec le moteur de synchronisation (L8-06). Écran de réussite : coche animée,
résumé (valeur, contexte, moment), « gardée sur ce téléphone », puis « Ajouter une autre » ou « Terminé ».

| Fichier                           | Rôle                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `entry.ts`                        | Logique sans interface : lecture, conversion, « quand ? », validation, doublon  |
| `local-store.ts` / `.web.ts`      | Écriture locale (SQLite) ; en mémoire dans l'aperçu web (SQLite n'y marche pas) |
| `unit-preference.ts` / `.web.ts`  | Unité mémorisée (stockage séparé des données de santé)                          |
| `components/ValueField.tsx`       | Grand champ de valeur + conversion en direct                                    |
| `components/WhenPicker.tsx`       | « Quand ? »                                                                     |
| `components/SavedState.tsx`       | Écran de réussite animé                                                         |
| `components/AddTabButton.tsx`     | Bouton « + » de la barre d'onglets                                              |
| `components/UnusualValueCard.tsx` | Question « est-ce correct ? » (L2-04)                                           |
| `components/SafetyNotice.tsx`     | Message de sécurité très bas / très haut (L2-04)                                |
| `__tests__/entry.test.ts`         | Tests de la logique                                                             |

## Valeur inhabituelle et message de sécurité (L2-04)

**Valeur inhabituelle** (hors 20–600 mg/dL, CDC F2) : en appuyant sur « Enregistrer », le clavier se ferme
et une carte couleur « attention » (ambre, jamais rouge) pose la question avec la valeur **telle que tapée** :
« 1 870 mg/dL : est-ce correct ? », et rappelle la plage habituelle dans l'unité choisie.

- **« C'était en mmol/L »** : proposé seulement si le même nombre est plausible dans une autre unité
  (`likelyUnits`) — 18,7 g/L devient 18,7 mmol/L. Le nombre est gardé, seule l'unité change.
- **« Oui, c'est correct »** : la mesure est enregistrée tout de suite avec `confirmedUnusual: true`
  (le serveur refuse sinon : 422 `UNUSUAL_VALUE`, contrat 0.2.1). Vrai seulement pour une valeur
  réellement inhabituelle ; changer la valeur ou l'unité annule la confirmation.
- **« Corriger la valeur »** : retour au champ, clavier ouvert.

**Message de sécurité** : sur l'écran de réussite, la mesure porte son badge d'état (couleur + symbole +
libellé) calculé avec **les seuils du patient**. Si elle est sous « très bas » ou au-dessus de « très haut »,
un encadré sobre affiche le texte du cahier des charges (« Suivez les consignes de votre équipe soignante.
En cas de malaise, demandez de l'aide immédiatement. »). **Aucune consigne de traitement ni de dose.**

**Seuils hors-ligne** : enregistrés sur le téléphone (`features/profile/local-thresholds.ts`, table `kv` de
la base locale, vidée à la déconnexion) quand le profil est enregistré. Absents ou illisibles : seuils par
défaut de `@glyka/shared`.

## Tests obligatoires

- [x] 1,48 g/L = 148 mg/dL ; virgule ou point ; mmol/L et mg/dL (`__tests__/entry.test.ts`).
- [x] Changer d'unité convertit la valeur tapée (1,48 g/L → 148 mg/dL → 8,2 mmol/L).
- [x] Saisie vide, illisible, nulle, trop de décimales ; 18,7 g/L inhabituelle.
- [x] « Quand ? » : maintenant à la minute, raccourcis, jour + heure, tour d'horloge, futur refusé.
- [x] Formulaire complet / erreurs par champ ; données écrites (valeur et unité d'origine, date ISO).
- [x] Doublon exact détecté (même minute + même valeur), pas pour une autre valeur ou minute.
- [x] L2-04 : 18,7 g/L refusée sans confirmation, acceptée confirmée ; la confirmation n'efface pas les
      autres erreurs ; `confirmedUnusual` vrai seulement pour une valeur réellement inhabituelle.
- [x] L2-04 : unité probable (18,7 g/L → mmol/L ; 1870 mg/dL → aucune) ; textes (« 1 870 mg/dL »).
- [x] L2-04 : message de sécurité aux seuils par défaut (54 / 250) et aux seuils du patient.
- [x] L2-04 : seuils gardés relus ; absents, illisibles ou incohérents ⇒ seuils par défaut
      (`features/profile/__tests__/stored-thresholds.test.ts`).

## Règle importante

On n'appelle JAMAIS l'API directement pour écrire une mesure : on écrit en local, la synchronisation s'en charge.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
