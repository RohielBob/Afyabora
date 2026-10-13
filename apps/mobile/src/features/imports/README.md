# Feature `imports` — Import CSV / Excel

**Lot L4 · Fonctionnalité F5**

Choix du fichier, correspondance des colonnes, rapport, décisions ligne par ligne.

## Tickets

- **L4-05** — Mobile : choix du fichier et de l'unité par défaut (**fait**)
- **L4-06** — Mobile : correspondance des colonnes (**fait**)
- **L4-07** — Mobile : rapport d'import et actions Corriger / Ignorer / Accepter (**fait**)

## Parcours

1. **Entrées** : Profil ⇒ « Importer un historique », ou l'Historique vide ⇒ « Importer un fichier ». Les deux ouvrent `/import`.
2. **`/import` (L4-05)**, en deux étapes numérotées :
   - **Le fichier** : sélecteur de documents (`expo-document-picker`), CSV ou Excel. La fiche du fichier choisi affiche son type, sa taille et un bouton « Changer de fichier ».
   - **L'unité des valeurs** (g/L, mg/dL, mmol/L, avec un exemple pour chacune) : elle sert aux lignes sans unité. Au départ, c'est l'unité préférée du patient (`readUnit`).
   - **« Analyser le fichier »** envoie le fichier à `POST /imports/preview` (multipart, 60 s maximum). **Rien n'est importé à cette étape.**
3. Ensuite :
   - analyse réussie ⇒ `/import/report` (L4-07) ;
   - colonnes introuvables (`400 IMPORT_COLUMNS_NOT_FOUND`, contrat 0.4.1) ⇒ `/import/mapping` (L4-06).
4. **`/import/mapping` (L4-06)** : le serveur a renvoyé la liste `columns` (noms des colonnes du fichier). Pour chaque rôle, le patient choisit une colonne en pastilles :
   - **Date** et **Glycémie** sont obligatoires ;
   - **Heure**, **Unité** et **Moment de la mesure** sont facultatifs (pastille « Aucune ») ; sans colonne d'unité, l'unité choisie pour le fichier s'applique.

   **Une colonne ne sert qu'à un rôle.** La pastille d'une colonne déjà prise indique « déjà pour la date », et la choisir ailleurs la retire de l'autre rôle (`assignColumn`) : pas de conflit à corriger ensuite. « Analyser avec ces colonnes » reste grisé tant que la date et la glycémie manquent, avec « Choisissez encore : … ».

   L'analyse est relancée avec `mapping` (même fichier, même unité) ⇒ rapport (L4-07). Si le serveur renvoie une **autre** liste, seuls les choix encore valables sont gardés (`keepKnownColumns`) et « Colonnes à vérifier » s'affiche. Sans parcours en cours (appli relancée, lien direct), l'écran propose de choisir de nouveau le fichier.

5. **`/import/report` (L4-07)** : le rapport et les décisions.
   - **Résumé** : lignes analysées, puis quatre cases (valides, doublons, à vérifier, erreurs). Chacune a sa couleur, son icône et son libellé ; ce ne sont pas des états de glycémie.
   - **Lignes non valides par groupe** (à vérifier, doublons, erreurs), dans l'ordre du fichier, 30 à la fois puis « Voir … de plus ». Chaque ligne affiche « Ligne 42 · 18,70 », la raison donnée par le serveur et un sélecteur **Ignorer · Accepter · Corriger**. Une ligne rejetée ne peut pas être acceptée telle quelle.
   - **Corriger** ouvre la saisie de la bonne valeur (virgule ou point) et de son unité. La valeur est vérifiée tout de suite : manquante, illisible, ou hors 20–600 mg/dL.
   - **En lot** : « Tout accepter » et « Tout ignorer » par groupe, sauf pour les erreurs. Une correction en cours est gardée.
   - **« Importer 141 mesures »** : le bouton annonce le nombre exact (valides plus lignes acceptées ou corrigées) et c'est **le seul qui écrit**. Sans décision, doublons, lignes à vérifier et erreurs sont ignorés (règle du serveur). Une correction incomplète bloque l'envoi et se signale sur sa ligne. Un refus du serveur pour une décision s'affiche sur **sa** ligne.
   - **Après l'import** : « 141 mesures importées · 6 lignes ignorées ». Les mesures sont sur le compte ; elles apparaîtront dans l'Historique du téléphone avec la synchronisation (L8-05, L8-06, pas encore faite), et l'écran le dit. **« Annuler cet import »** demande confirmation (« Retirer les 141 mesures » / « Garder l'import »), puis retire toutes les mesures du lot.
   - **Échecs** : hors-ligne (« Rien n'a été importé », Réessayer) ; déjà importé ou annulé (409) ; rapport de plus de 24 h ; lot introuvable. Ces trois derniers proposent de recommencer.

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
- **Réponses vérifiées** avec les schémas de `@glyka/shared` : `importReportSchema` pour le rapport, `importColumnsErrorSchema` pour la liste des colonnes, `importCommitResponseSchema` et `importRevertResponseSchema` pour l'import et l'annulation. Une réponse inattendue devient une erreur, jamais un affichage faux.

## Fichiers

| Fichier                           | Rôle                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `start.ts`                        | Contrôle du fichier, taille lisible, exemples d'unités, issue d'une analyse ratée (fonctions pures)                                   |
| `api.ts`                          | `POST /imports/preview` : formulaire multipart (`buildPreviewForm`), réponse vérifiée                                                 |
| `mapping.ts`                      | Choix des colonnes : rôles, contrôles (`mappingIssues`), correspondance envoyée (`toMapping`), `assignColumn`                         |
| `report.ts`                       | Rapport : groupes, actions permises, décisions en lot, valeur corrigée, décisions envoyées, nombre importé, échecs, paquets de lignes |
| `flow.ts`                         | Parcours d'import en mémoire, partagé par les 3 écrans (`importFlow`, `useImportFlow`)                                                |
| `components/FilePickerCard.tsx`   | Zone « Choisir un fichier », puis fiche du fichier choisi (type, taille, « Changer de fichier »)                                      |
| `components/ColumnRoleChoice.tsx` | Choix d'une colonne pour un rôle (pastilles, « Obligatoire » / « Facultatif », « déjà pour… »)                                        |
| `components/ImportMessages.tsx`   | Messages communs : échec de l'analyse (`ProblemAlert`) et petites notes (`Note`)                                                      |
| `components/ReportSummary.tsx`    | Résumé du rapport : lignes analysées et quatre cases (couleur + icône + libellé)                                                      |
| `components/ReportRowCard.tsx`    | Une ligne non valide : valeur, raison, Ignorer · Accepter · Corriger, saisie de la correction                                         |
| `components/BackButton.tsx`       | « Retour » des écrans de l'import                                                                                                     |
| `components/StepTitle.tsx`        | Titre d'étape numéroté (« 1 Le fichier »), lu « Étape 1 : Le fichier » par le lecteur d'écran                                         |
| `__tests__/start.test.ts`         | Tests : contrôle du fichier, tailles, issues de l'analyse, formulaire, parcours, traductions                                          |
| `__tests__/mapping.test.ts`       | Tests de L4-06 : rôles, contrôles, déplacement d'une colonne, nouvelle liste, parcours, traductions                                   |
| `__tests__/report.test.ts`        | Tests de L4-07 : groupes, décisions (une à une et en lot), corrections, nombre importé, échecs, paquets, pluriels                     |

Les écrans sont `app/import/index.tsx` (L4-05), `app/import/mapping.tsx` (L4-06) et `app/import/report.tsx` (L4-07). Les tests du client HTTP (multipart, délai) sont dans `src/lib/__tests__/api-client.test.ts`.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
