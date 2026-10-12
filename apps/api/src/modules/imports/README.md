# Module `imports`

**Lot : L4 · Fonctionnalité : F5 · Tickets : L4-01 à L4-04, L4-08**

Import CSV / Excel avec validation et rapport.

## Routes

- POST /imports/preview : analyse le fichier, crée un lot `PREVIEW`, renvoie le rapport
- POST /imports/:id/commit : applique les décisions (Corriger / Ignorer / Accepter)
- DELETE /imports/:id : annule un lot déjà importé

## Règles de gestion

- Limites : 5 Mo, 5 000 lignes (`IMPORT_MAX_*`).
- CSV : séparateurs `;` `,` tabulation ; virgule ou point décimal ; encodages UTF-8 et Windows-1252.
- Dates `jj/mm/aaaa`, `aaaa-mm-jj`, avec ou sans heure.
- Statuts : VALID, DUPLICATE (dans la base ET dans le fichier), INCONSISTENT (hors bornes pour l'unité), ERROR (illisible, date future).
- RIEN n'est écrit dans `Measurement` avant `commit`.
- Mesures importées : `source = IMPORT`, `importBatchId` renseigné ; annulation = tombstones de tout le lot.

## Lecture du fichier CSV (L4-01, `csv-parser.ts`)

Fonctions pures, sans base : octets du fichier ⇒ en-têtes + lignes. Elles ne décident **pas** du statut d'une ligne (L4-03).

- **Encodage** : UTF-8 (BOM retiré) ; UTF-16 si le fichier commence par un BOM UTF-16 (export « texte Unicode » d'Excel) ; sinon **Windows-1252**. Les octets 0x80–0x9F (« ’ », « œ », « € », « … ») sont décodés avec la table officielle : le décodeur `windows-1252` de Node les lit comme du Latin-1 et les perdrait.
- **Séparateur** : `;`, tabulation ou `,`. Sur les 20 premières lignes non vides, on garde le séparateur qui donne au moins 2 colonnes dans l'en-tête et le plus de lignes régulières (puis le plus de colonnes, puis l'ordre `;`, tabulation, `,`). Une première ligne Excel `sep=;` impose le séparateur. Une valeur décimale dans un fichier à virgules doit être entre guillemets (`"1,1"`).
- **Nombres** : `0,92`, `0.92`, `1 870` (espace, espace insécable ou espace fine) sont lus ; tout le reste (`abc`, `-5`, `1,2,3`, `1.234,5`, `5 mg/dL`) donne `null`, et la valeur brute est gardée pour le rapport.
- **Colonnes** : date, heure, valeur, unité et contexte sont reconnues d'après l'en-tête, sans accents ni majuscules. Un nom exact passe d'abord (`Glycémie`), puis un nom qui contient le mot entier (`Glycémie (g/L)`). Une colonne ne sert qu'une fois. La correspondance donnée par le patient (`mapping`) passe avant, par nom exact puis sans accents.
- **Numéros de ligne** : ce sont ceux du fichier (l'en-tête est la ligne 1). Les lignes vides sont ignorées mais comptées, ainsi que la ligne `sep=`. Un champ entre guillemets sur deux lignes est bien géré.
- **Lignes abîmées** : une ligne avec trop ou trop peu de colonnes est rendue avec `columnMismatch: true`. L'analyse ne plante jamais à cause d'une ligne.
- **Erreurs sur le fichier entier** (`CsvImportError.code`) :
  - `EMPTY` : rien, ou seulement un en-tête ;
  - `TOO_LARGE` : plus de 5 Mo ;
  - `TOO_MANY_ROWS` : plus de 5 000 lignes ;
  - `NOT_TABULAR` : une seule colonne ;
  - `UNKNOWN_COLUMN` : la correspondance donnée cite une colonne absente ;
  - `MISSING_COLUMNS` : date ou valeur introuvable.

  Les deux dernières renvoient aussi la liste des en-têtes, pour que l'appli propose de choisir les colonnes (L4-06).

- Tests : `test/imports-csv.test.ts` (44 tests, dont les deux fichiers de `scripts/sample-data/`).

## Tests obligatoires

- [ ] `scripts/sample-data/import-demo-147.csv` : 139 valides, 5 doublons, 3 incohérentes.
- [ ] `.xlsx` corrompu : erreur claire, pas de plantage.
- [ ] Annuler un lot supprime toutes ses mesures.
- [ ] Ligne 42 (18,7 g/L) signalée « vérifier l'unité ».

## Fichiers

| Fichier                 | Rôle                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `imports.module.ts`     | Déclaration du module NestJS                                                                           |
| `imports.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `imports.service.ts`    | Logique métier et accès base (Prisma)                                                                  |
| `csv-parser.ts`         | Lecture d'un fichier CSV (encodage, séparateur, colonnes, nombres, numéros de ligne) : fonctions pures |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
