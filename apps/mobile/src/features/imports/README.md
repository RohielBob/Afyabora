# Feature `imports` — Import CSV / Excel

**Lot L4 · Fonctionnalité F5**

Choix du fichier, correspondance des colonnes, rapport, décisions ligne par ligne.

## Tickets

- **L4-05** — Mobile : choix du fichier et de l'unité par défaut (**fait**)
- **L4-06** — Mobile : correspondance des colonnes
- **L4-07** — Mobile : rapport d'import et actions Corriger / Ignorer / Accepter

## Parcours

1. **Entrées** : Profil ⇒ « Importer un historique », ou l'Historique vide ⇒ « Importer un fichier ». Les deux ouvrent `/import`.
2. **`/import` (L4-05)**, en deux étapes numérotées :
   - **Le fichier** : sélecteur de documents (`expo-document-picker`), CSV ou Excel. La fiche du fichier choisi affiche son type, sa taille et un bouton « Changer de fichier ».
   - **L'unité des valeurs** (g/L, mg/dL, mmol/L, avec un exemple pour chacune) : elle sert aux lignes sans unité. Au départ, c'est l'unité préférée du patient (`readUnit`).
   - **« Analyser le fichier »** envoie le fichier à `POST /imports/preview` (multipart, 60 s maximum). **Rien n'est importé à cette étape.**
3. Ensuite :
   - analyse réussie ⇒ `/import/report` (L4-07) ;
   - colonnes introuvables (`400 IMPORT_COLUMNS_NOT_FOUND`, contrat 0.4.1) ⇒ `/import/mapping` (L4-06).

## Règles

- **Contrôles immédiats, avant l'envoi** (`checkFile`) :
  - extension `.csv`, `.txt`, `.tsv` ou `.xlsx` ;
  - `.xls` ⇒ message dédié « enregistrez-le en .xlsx ou en CSV » ;
  - autre type ⇒ « non pris en charge » ;
  - fichier vide, ou plus de 5 Mo ⇒ refusé sans envoi.

  Le serveur refait tous les contrôles.

- **Échecs de l'analyse** (`previewProblem`), chacun avec un message clair :
  - hors-ligne et trop d'analyses (429) ⇒ message, avec « Réessayer » ;
  - fichier trop gros (413) ;
  - fichier illisible ⇒ le message précis du serveur ;
  - autre refus (profil à compléter) ;
  - erreur inattendue.
- **L'import demande le réseau** : l'analyse se fait sur le serveur, et l'écran le dit.
- **Rien n'est gardé sur le téléphone** :
  - le parcours (fichier choisi, unité, dernier rapport) vit **en mémoire** (`importFlow`) et disparaît en quittant l'app ;
  - changer de fichier ou d'unité oublie l'ancien rapport ;
  - le fichier lui-même n'est jamais copié ailleurs que dans le cache du sélecteur.
- **Envoi** : sur le téléphone, le fichier est désigné par son adresse locale (`{ uri, name, type }`), sans être chargé en mémoire ; sur le web, c'est le vrai fichier (`Blob`). Le client HTTP (`@/lib/api-client`) envoie un `FormData` tel quel, sans `Content-Type` manuel, et accepte un délai propre à chaque requête (`timeoutMs`).
- **Réponse vérifiée** avec `importReportSchema` (`@glyka/shared`) : une réponse inattendue devient une erreur, jamais un rapport faux.

## Fichiers

| Fichier                         | Rôle                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `start.ts`                      | Contrôle du fichier, taille lisible, exemples d'unités, issue d'une analyse ratée (fonctions pures) |
| `api.ts`                        | `POST /imports/preview` : formulaire multipart (`buildPreviewForm`), réponse vérifiée               |
| `flow.ts`                       | Parcours d'import en mémoire, partagé par les 3 écrans (`importFlow`, `useImportFlow`)              |
| `components/FilePickerCard.tsx` | Zone « Choisir un fichier », puis fiche du fichier choisi (type, taille, « Changer de fichier »)    |
| `components/StepTitle.tsx`      | Titre d'étape numéroté (« 1 Le fichier »), lu « Étape 1 : Le fichier » par le lecteur d'écran       |
| `__tests__/start.test.ts`       | Tests : contrôle du fichier, tailles, issues de l'analyse, formulaire, parcours, traductions        |

L'écran est `app/import/index.tsx`. Les tests du client HTTP (multipart, délai) sont dans `src/lib/__tests__/api-client.test.ts`.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
